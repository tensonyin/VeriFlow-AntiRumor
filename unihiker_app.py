import os
import sys
import json
import time
import queue
import threading
import subprocess
import textwrap
import ssl
import urllib3
import re

# Global SSL bypass to resolve certificate verification issues on older board OS
try:
    ssl._create_default_https_context = ssl._create_unverified_context
except AttributeError:
    pass

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='ignore')
        sys.stderr.reconfigure(encoding='utf-8', errors='ignore')
    except AttributeError:
        pass

# -----------------------------------------------------------------------------
# 1. Dependency Auto-Installer Bootstrap
# -----------------------------------------------------------------------------
def install_dependencies():
    # Map import name to pip installation name
    packages = {
        "requests": "requests",
        "edge_tts": "edge-tts",
        "flask": "flask"
    }
    missing_packages = []
    
    for import_name, pip_name in packages.items():
        try:
            __import__(import_name)
        except ImportError:
            missing_packages.append(pip_name)
            
    if missing_packages:
        print(f"Installing missing dependencies: {missing_packages}...")
        try:
            # On UNIHIKER/Linux, pip is usually available.
            subprocess.check_call([sys.executable, "-m", "pip", "install"] + missing_packages)
            print("Dependencies installed successfully!")
        except Exception as e:
            print(f"Warning: Failed to install dependencies via pip: {e}")
            print("Please run 'pip install requests edge-tts flask' manually.")

install_dependencies()

import requests
import socket

# -----------------------------------------------------------------------------
# 2. Configuration Loader
# -----------------------------------------------------------------------------
CONFIG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.json")
config = {
    "dify_api_key": os.environ.get("DIFY_API_KEY", ""),
    "dify_base_url": "https://api.dify.ai/v1",
    "max_record_seconds": 30,
    "tts_voice": "zh-CN-XiaoxiaoNeural"
}

if os.path.exists(CONFIG_PATH):
    try:
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            config.update(json.load(f))
        print("Loaded configuration from config.json")
    except Exception as e:
        print(f"Error loading config.json: {e}, using defaults")
else:
    print("config.json not found, using default settings")

# Allow environment variables to override config file keys
if os.environ.get("DIFY_API_KEY"):
    config["dify_api_key"] = os.environ.get("DIFY_API_KEY")

# -----------------------------------------------------------------------------
# 3. UNIHIKER Board vs PC Simulation Check
# -----------------------------------------------------------------------------
try:
    from unihiker import GUI, Audio
    ON_BOARD = True
    print("Running on UNIHIKER hardware.")
except ImportError:
    ON_BOARD = False
    print("unihiker library not found. Launching PC simulation mode...")

# Initialize PinPong for onboard buzzer
buzzer = None
if ON_BOARD:
    try:
        from pinpong.board import Board
        from pinpong.extension.unihiker import buzzer
        Board().begin()
        print("PinPong Board initialized successfully.")
    except Exception as pinpong_err:
        print(f"Failed to initialize PinPong Board: {pinpong_err}")
        buzzer = None

def beep_twice():
    print("[BUZZER] Beeping twice...")
    if ON_BOARD and buzzer:
        try:
            # Beep 1
            buzzer.pitch(1000)
            time.sleep(0.15)
            try:
                buzzer.stop()
            except Exception:
                pass
            time.sleep(0.15)
            # Beep 2
            buzzer.pitch(1000)
            time.sleep(0.15)
            try:
                buzzer.stop()
            except Exception:
                pass
        except Exception as e:
            print(f"Buzzer play failed: {e}")
            try:
                buzzer.stop()
            except Exception:
                pass
    else:
        # Mock beep on PC simulation
        try:
            if sys.platform == "win32":
                import winsound
                winsound.Beep(1000, 150)
                time.sleep(0.15)
                winsound.Beep(1000, 150)
            else:
                sys.stdout.write('\a')
                sys.stdout.flush()
                time.sleep(0.3)
                sys.stdout.write('\a')
                sys.stdout.flush()
        except Exception:
            pass


# PC Simulation Classes using standard Tkinter
if not ON_BOARD:
    import tkinter as tk
    
    # Simple Mock Audio recorder and player for PC
    class Audio:
        def __init__(self):
            self.recording = False
            self.start_time = 0
            self.playing_process = None
            self.play_start_time = 0
            self.play_duration = 0
            
        def start_record(self, filename):
            print(f"[MOCK AUDIO] Started recording to {filename}")
            self.recording = True
            self.start_time = time.time()
            
        def stop_record(self):
            print("[MOCK AUDIO] Stopped recording")
            self.recording = False
            # Generate a dummy WAV file for testing if it doesn't exist
            try:
                with open("input.wav", "wb") as f:
                    f.write(b'RIFF\x24\x08\x00\x00WAVEfmt \x10\x00\x00\x00\x01\x00\x01\x00\x80\x3e\x00\x00\x00\x7d\x00\x00\x02\x00\x10\x00data\x00\x08\x00\x00')
                    f.write(b'\x00' * 2000)
            except Exception as e:
                print(f"[MOCK AUDIO] Failed to write dummy WAV file: {e}")
            
        def play(self, filename):
            self.start_play(filename)
            while self.play_time_remain() > 0:
                time.sleep(0.1)

        def start_play(self, filename):
            print(f"[MOCK AUDIO] Starting playback of: {filename}")
            self.stop_play()
            
            # Simple duration estimation (default to 5s, or compute based on size)
            self.play_duration = 5.0
            if os.path.exists(filename):
                # Rough estimate: ~15KB per second for 128kbps MP3
                self.play_duration = max(3.0, os.path.getsize(filename) / 16000.0)
                
            self.play_start_time = time.time()
            
            try:
                if sys.platform == "win32":
                    abs_path = os.path.abspath(filename)
                    cmd = f'powershell -c "$m = New-Object -ComObject WMPlayer.OCX; $m.URL = \\\'{abs_path}\\\'; $m.controls.play(); while (`$m.playState -ne 1) {{ Start-Sleep -Milliseconds 100 }}"'
                    self.playing_process = subprocess.Popen(["powershell", "-Command", cmd], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                elif sys.platform == "darwin":
                    self.playing_process = subprocess.Popen(["afplay", filename])
                else:
                    self.playing_process = subprocess.Popen(["aplay", filename])
            except Exception as e:
                print(f"[MOCK AUDIO] Playback failed: {e}")

        def stop_play(self):
            if self.playing_process:
                try:
                    self.playing_process.terminate()
                    self.playing_process.wait(timeout=1.0)
                except Exception:
                    pass
                self.playing_process = None
            self.play_duration = 0
            
        def play_time_remain(self):
            if self.play_duration == 0:
                return 0
            elapsed = time.time() - self.play_start_time
            remain = self.play_duration - elapsed
            return max(0.0, remain)


    # Simulated UNIHIKER GUI using standard Tkinter
    class GUI:
        def __init__(self):
            self.root = tk.Tk()
            self.root.title("行空板模拟器 (240x320)")
            self.root.geometry("280x380")
            self.root.configure(bg="#222")
            self.root.resizable(False, False)
            
            # The 240x320 Unihiker screen canvas
            self.canvas = tk.Canvas(self.root, width=240, height=320, bg="#0f1011", highlightthickness=0)
            self.canvas.pack(pady=10)
            
            # Simulated Physical Button A & B indicators/buttons
            self.btn_frame = tk.Frame(self.root, bg="#222")
            self.btn_frame.pack(fill="x", padx=20)
            
            self.btn_a_handler = None
            self.btn_b_handler = None
            
            self.btn_a = tk.Button(self.btn_frame, text="A键 (录音)", command=self._click_a, bg="#444", fg="white")
            self.btn_a.pack(side="left", expand=True, fill="x", padx=5)
            
            self.btn_b = tk.Button(self.btn_frame, text="B键 (切换模式)", command=self._click_b, bg="#444", fg="white")
            self.btn_b.pack(side="right", expand=True, fill="x", padx=5)
            
            # Bind keyboard keys A and B for quick simulation
            self.root.bind("<Key-a>", lambda e: self._click_a())
            self.root.bind("<Key-b>", lambda e: self._click_b())
            
            self.widgets = []
            
        def _click_a(self):
            if self.btn_a_handler:
                self.btn_a_handler()
                
        def _click_b(self):
            if self.btn_b_handler:
                self.btn_b_handler()
                
        def on_a_click(self, handler):
            self.btn_a_handler = handler
            
        def on_b_click(self, handler):
            self.btn_b_handler = handler
            
        # Draw elements wrapper
        def draw_text(self, x, y, text, font_size=12, color="white", origin="top-left"):
            # Simple text label widget drawn on canvas
            anchor = "nw"
            if origin == "center":
                anchor = "center"
            
            widget_id = self.canvas.create_text(
                x, y, text=text, fill=color, font=("Suisse Int'l", font_size), anchor=anchor, width=220
            )
            element = CanvasWidget(self, widget_id, "text")
            self.widgets.append(element)
            return element
            
        def draw_rect(self, x, y, w, h, width=1, color="white"):
            widget_id = self.canvas.create_rectangle(
                x, y, x+w, y+h, outline=color, width=width
            )
            element = CanvasWidget(self, widget_id, "rect")
            self.widgets.append(element)
            return element
            
        def fill_rect(self, x, y, w, h, color="white"):
            widget_id = self.canvas.create_rectangle(
                x, y, x+w, y+h, fill=color, outline=""
            )
            element = CanvasWidget(self, widget_id, "rect")
            self.widgets.append(element)
            return element
            
        def add_button(self, x, y, w, h, text, onclick=None):
            # Simulated button widget
            button = tk.Button(self.root, text=text, command=onclick, font=("Suisse Int'l", 10))
            widget_id = self.canvas.create_window(x + w/2, y + h/2, window=button, width=w, height=h)
            element = CanvasWidget(self, widget_id, "window", button)
            self.widgets.append(element)
            return element

        def clear(self):
            self.canvas.delete("all")
            for w in self.widgets:
                if w.type == "window" and w.tk_widget:
                    w.tk_widget.destroy()
            self.widgets = []
            
        def remove(self, element):
            if element in self.widgets:
                self.canvas.delete(element.id)
                if element.type == "window" and element.tk_widget:
                    element.tk_widget.destroy()
                self.widgets.remove(element)
                
        def after(self, ms, func):
            self.root.after(ms, func)
            
        def update_screen(self):
            self.root.update_idletasks()
            self.root.update()

    # Wrap Tkinter canvas object to simulate Unihiker widget behavior
    class CanvasWidget:
        def __init__(self, gui, widget_id, w_type, tk_widget=None):
            self.gui = gui
            self.id = widget_id
            self.type = w_type
            self.tk_widget = tk_widget
            
        def config(self, **kwargs):
            if "text" in kwargs:
                self.gui.canvas.itemconfig(self.id, text=kwargs["text"])
            if "color" in kwargs:
                self.gui.canvas.itemconfig(self.id, fill=kwargs["color"])
            if "font_size" in kwargs:
                self.gui.canvas.itemconfig(self.id, font=("Suisse Int'l", kwargs["font_size"]))
            if "w" in kwargs:
                coords = self.gui.canvas.coords(self.id)
                if len(coords) == 4:
                    self.gui.canvas.coords(self.id, coords[0], coords[1], coords[0] + kwargs["w"], coords[3])
            if self.tk_widget:
                if "text" in kwargs:
                    self.tk_widget.config(text=kwargs["text"])
                if "state" in kwargs:
                    self.tk_widget.config(state=kwargs["state"])

# -----------------------------------------------------------------------------
# 4. State Machine & Global Variables
# -----------------------------------------------------------------------------
STATE_READY = "READY"
STATE_RECORDING = "RECORDING"
STATE_TRANSCRIBING = "TRANSCRIBING"
STATE_ANALYZING = "ANALYZING"
STATE_REPORT = "REPORT"
STATE_ERROR = "ERROR"

current_state = STATE_READY
is_elderly_mode = False
current_log_dir = None

# Message Queue for thread-safe UI updates
ui_queue = queue.Queue()

# State variables
record_seconds = 0
active_recording_file = "input.wav"
analyzing_progress = []
final_report_text = ""
final_verdict = ""  # 谣言 / 证实 / 存疑
error_message_text = ""
tts_playing = False
tts_audio_ready = False  # Flag: new TTS audio is available for Wi-Fi streaming
wifi_audio_url = ""     # The URL to display on screen for the user

# Screen GUI components references
screen_widgets = {}

gui = GUI()
audio = Audio()

# Monkeypatch draw_text to filter out non-BMP characters (emojis) to prevent Tkinter TclError
original_draw_text = gui.draw_text
def safe_draw_text(*args, **kwargs):
    clean_args = []
    for arg in args:
        if isinstance(arg, str):
            clean_args.append("".join(c for c in arg if ord(c) <= 0xffff))
        else:
            clean_args.append(arg)
            
    clean_kwargs = {}
    for k, v in kwargs.items():
        if isinstance(v, str):
            clean_kwargs[k] = "".join(c for c in v if ord(c) <= 0xffff)
        else:
            clean_kwargs[k] = v
            
    return original_draw_text(*clean_args, **clean_kwargs)

gui.draw_text = safe_draw_text

# -----------------------------------------------------------------------------
# 5. UI Color Schemes (Normal vs Elderly)
# -----------------------------------------------------------------------------
COLORS = {
    # Normal Mode: Sleek Obsidian, Carbon, and Frost Accents
    "normal": {
        "bg": "#0f1011",
        "title": "#ffffff",
        "status": "#9f9fa0",
        "text": "#cacaca",
        "accent": "#00b3dd", # Cyan Spark
        "button_bg": "#2e2e2e",
        "card_bg": "#090a0b"
    },
    # Elderly Mode: High-contrast Dark Blue background, Bright Yellow/White Text
    "elderly": {
        "bg": "#001a33",
        "title": "#ffe600", # Yellow
        "status": "#ffffff",
        "text": "#ffffff",
        "accent": "#ffe600",
        "button_bg": "#ffe600",
        "card_bg": "#002b4d"
    }
}

def get_colors():
    return COLORS["elderly"] if is_elderly_mode else COLORS["normal"]

# Wrap helper for multi-line displays
def get_wrap_width():
    # Character count before wrapping
    return 11 if is_elderly_mode else 17

# -----------------------------------------------------------------------------
# 6. Screen Redrawing & State Renderers
# -----------------------------------------------------------------------------
def redraw_screen():
    gui.clear()
    screen_widgets.clear()
    
    colors = get_colors()
    
    # Draw Background (or fill canvas)
    if not ON_BOARD:
        gui.canvas.config(bg=colors["bg"])
    else:
        # On UNIHIKER board, we can draw a full-screen rect to simulate background color changes
        gui.fill_rect(x=0, y=0, w=240, h=320, color=colors["bg"])
        
    # Render state-specific layouts
    if current_state == STATE_READY:
        render_ready_screen(colors)
    elif current_state == STATE_RECORDING:
        render_recording_screen(colors)
    elif current_state == STATE_TRANSCRIBING:
        render_transcribing_screen(colors)
    elif current_state == STATE_ANALYZING:
        render_analyzing_screen(colors)
    elif current_state == STATE_REPORT:
        render_report_screen(colors)
    elif current_state == STATE_ERROR:
        render_error_screen(colors)

def render_ready_screen(colors):
    title_text = "辟谣助手(长辈模式)" if is_elderly_mode else "多模态谣言终结者"
    title_size = 20 if is_elderly_mode else 16
    
    gui.draw_text(x=120, y=25, text=title_text, font_size=title_size, color=colors["title"], origin="center")
    
    # Mic Circle/Button layout
    gui.fill_rect(x=30, y=80, w=180, h=120, color=colors["card_bg"])
    gui.draw_rect(x=30, y=80, w=180, h=120, width=2, color=colors["accent"])
    
    status_text = "按 A 键开始录音" if is_elderly_mode else "按 A 键开始录制传言"
    status_size = 18 if is_elderly_mode else 13
    gui.draw_text(x=120, y=140, text=status_text, font_size=status_size, color=colors["text"], origin="center")
    
    # Legend
    gui.draw_text(x=120, y=240, text="长按 30秒 自动结束", font_size=16 if is_elderly_mode else 12, color=colors["status"], origin="center")
    
    legend_text = "A键: 录音  B键: 切换模式" if is_elderly_mode else "A键: 录音 | B键: 切换模式"
    legend_size = 15 if is_elderly_mode else 12
    gui.draw_text(x=120, y=290, text=legend_text, font_size=legend_size, color=colors["status"], origin="center")

def render_recording_screen(colors):
    title_text = "正在录音"
    title_size = 24 if is_elderly_mode else 18
    gui.draw_text(x=120, y=30, text=title_text, font_size=title_size, color=colors["accent"], origin="center")
    
    # Recording animation indicator
    gui.fill_rect(x=40, y=90, w=160, h=100, color=colors["card_bg"])
    
    timer_size = 32 if is_elderly_mode else 24
    screen_widgets["timer"] = gui.draw_text(x=120, y=140, text=f"00:{record_seconds:02d}", font_size=timer_size, color=colors["title"], origin="center")
    
    info_text = "按 A 键结束录音"
    info_size = 18 if is_elderly_mode else 14
    gui.draw_text(x=120, y=230, text=info_text, font_size=info_size, color=colors["text"], origin="center")
    
    # State progress bar
    progress_w = int((record_seconds / config["max_record_seconds"]) * 180)
    gui.fill_rect(x=30, y=270, w=180, h=8, color="#444")
    screen_widgets["progress_bar"] = gui.fill_rect(x=30, y=270, w=progress_w, h=8, color=colors["accent"])

def render_transcribing_screen(colors):
    gui.draw_text(x=120, y=60, text="音频上传中...", font_size=24 if is_elderly_mode else 16, color=colors["title"], origin="center")
    
    # Draw loading spinner box
    gui.fill_rect(x=30, y=110, w=180, h=100, color=colors["card_bg"])
    gui.draw_text(x=120, y=160, text="正在发送音频...", font_size=18 if is_elderly_mode else 13, color=colors["text"], origin="center")
    
    gui.draw_text(x=120, y=260, text="请稍候...", font_size=16 if is_elderly_mode else 12, color=colors["status"], origin="center")

def render_analyzing_screen(colors):
    title_text = "核查进行中"
    title_size = 22 if is_elderly_mode else 18
    gui.draw_text(x=120, y=20, text=title_text, font_size=title_size, color=colors["accent"], origin="center")
    
    # Progress logs panel
    gui.fill_rect(x=15, y=60, w=210, h=220, color=colors["card_bg"])
    
    # Print the log lines dynamically
    log_y = 75
    line_spacing = 38 if is_elderly_mode else 28
    font_size = 17 if is_elderly_mode else 12
    max_visible_lines = 5 if is_elderly_mode else 7
    
    # Show only the last N logs to prevent overflow
    display_logs = analyzing_progress[-max_visible_lines:]
    
    for i, log in enumerate(display_logs):
        # Truncate string to prevent wrapping and overlapping
        max_chars = 11 if is_elderly_mode else 16
        clean_log = log
        if len(log) > max_chars:
            clean_log = log[:max_chars-3] + "..."
        gui.draw_text(x=25, y=log_y, text=clean_log, font_size=font_size, color=colors["text"])
        log_y += line_spacing
        
    # Loading animation placeholder
    running_indicator = "正在查证中..." if is_elderly_mode else "正在处理工作流节点..."
    gui.draw_text(x=120, y=295, text=running_indicator, font_size=16 if is_elderly_mode else 12, color=colors["status"], origin="center")

def clean_markdown(text):
    if not text:
        return ""
    # Strip markdown headers (e.g. ### Title)
    cleaned = re.sub(r'#+\s*', '', text)
    # Strip bold markers (**text**)
    cleaned = cleaned.replace("**", "")
    # Strip bullet points/asterisks at start of lines
    cleaned = re.sub(r'^\s*[\*\-\+]\s+', '', cleaned, flags=re.MULTILINE)
    # Clean triple-dash or triple-asterisk dividers
    cleaned = re.sub(r'[\-\*]{3,}', '', cleaned)
    return cleaned.strip()

def render_report_screen(colors):
    title_text = "核查报告"
    title_size = 22 if is_elderly_mode else 18
    gui.draw_text(x=120, y=18, text=title_text, font_size=title_size, color=colors["accent"], origin="center")
    
    # Report background card
    gui.fill_rect(x=10, y=45, w=220, h=225, color=colors["card_bg"])
    
    # Determine verdict display
    verdict = final_verdict or "存疑"
    
    # Map verdict to color and label
    if "谣言" in verdict or "伪造" in verdict or "假" in verdict:
        verdict_label = "谣 言"
        verdict_color = "#ff4d4d"  # Red
        verdict_icon = "X"
    elif "证实" in verdict or "真" in verdict:
        verdict_label = "证 实"
        verdict_color = "#00ff66"  # Green
        verdict_icon = "V"
    else:
        verdict_label = "存 疑"
        verdict_color = "#ffe600"  # Yellow
        verdict_icon = "?"
    
    # Draw large verdict icon circle
    circle_y = 90
    gui.fill_rect(x=80, y=circle_y, w=80, h=80, color=verdict_color)
    gui.draw_text(x=120, y=circle_y + 40, text=verdict_icon, font_size=40, color=colors["card_bg"], origin="center")
    
    # Draw verdict text
    gui.draw_text(x=120, y=195, text=verdict_label, font_size=32 if is_elderly_mode else 28, color=verdict_color, origin="center")
    
    # Brief summary line (first non-empty line of report, max 20 chars)
    summary = ""
    if final_report_text:
        cleaned = clean_markdown(final_report_text).replace("\n\n", "\n").strip()
        for line in cleaned.split("\n"):
            line = line.strip()
            if line and len(line) > 4:
                summary = line[:20] + ("..." if len(line) > 20 else "")
                break
    if summary:
        gui.draw_text(x=120, y=240, text=summary, font_size=12 if is_elderly_mode else 10, color=colors["text"], origin="center")
    
    # Legend (simple, no URL)
    if tts_playing:
        legend_text = "[语音生成中...]"
    else:
        legend_text = "A:生成语音  B:重新录音" if is_elderly_mode else "A:生成语音 | B:重新输入"
    legend_size = 15 if is_elderly_mode else 12
    gui.draw_text(x=120, y=290, text=legend_text, font_size=legend_size, color=colors["status"], origin="center")
# render_confirm_text_screen removed - audio is sent directly without ASR confirmation

def render_error_screen(colors):
    title_text = "出错了"
    title_size = 22 if is_elderly_mode else 18
    gui.draw_text(x=120, y=18, text=title_text, font_size=title_size, color="#ff4d4d", origin="center")
    
    # Background card
    gui.fill_rect(x=10, y=45, w=220, h=225, color=colors["card_bg"])
    
    # Wrap error message
    wrapped_lines = []
    err_text = str(error_message_text or "未知错误")
    
    raw_lines = err_text.split('\n')
    wrap_width = get_wrap_width()
    for line in raw_lines:
        if not line:
            wrapped_lines.append("")
            continue
        wrapped_lines.extend(textwrap.wrap(line, width=wrap_width))
        
    text_y = 52
    line_spacing = 26 if is_elderly_mode else 18
    font_size = 16 if is_elderly_mode else 11
    max_lines = 8 if is_elderly_mode else 12
    
    for i, line in enumerate(wrapped_lines[:max_lines]):
        gui.draw_text(x=16, y=text_y, text=line, font_size=font_size, color=colors["text"])
        text_y += line_spacing
        
    # Legend
    legend_text = "A/B键: 返回首页"
    legend_size = 15 if is_elderly_mode else 12
    gui.draw_text(x=120, y=290, text=legend_text, font_size=legend_size, color=colors["status"], origin="center")

# -----------------------------------------------------------------------------
# 7. Button Callback Triggers (State Machine Drivers)
# -----------------------------------------------------------------------------
def on_press_a():
    global current_state, record_seconds
    print(f"Button A pressed in state: {current_state}")
    
    if current_state == STATE_READY:
        # Start manual recording
        current_state = STATE_RECORDING
        record_seconds = 0
        ui_queue.put({"action": "redraw"})
        stop_tts_playback()
        threading.Thread(target=recording_worker, daemon=True).start()
        
    elif current_state == STATE_RECORDING:
        # Stop recording manually and transition immediately
        current_state = STATE_TRANSCRIBING
        audio.stop_record()
        
    elif current_state == STATE_REPORT:
        if not tts_playing:
            # Confirm playback: play TTS in background thread
            threading.Thread(target=play_tts_report, args=(final_report_text,), daemon=True).start()
        else:
            # If already playing, pressing A means user wants to interrupt and re-record
            current_state = STATE_RECORDING
            record_seconds = 0
            ui_queue.put({"action": "redraw"})
            stop_tts_playback()
            threading.Thread(target=recording_worker, daemon=True).start()
        
    elif current_state == STATE_ERROR:
        # Return to home
        current_state = STATE_READY
        ui_queue.put({"action": "redraw"})

def on_press_b():
    global is_elderly_mode, current_state, record_seconds
    print(f"Button B pressed in state: {current_state}")
    
    if current_state == STATE_ERROR:
        # Cancel and return to home
        current_state = STATE_READY
        ui_queue.put({"action": "redraw"})
    elif current_state == STATE_REPORT:
        if not tts_playing:
            # Re-input/re-record: start manual recording immediately
            current_state = STATE_RECORDING
            record_seconds = 0
            ui_queue.put({"action": "redraw"})
            stop_tts_playback()
            threading.Thread(target=recording_worker, daemon=True).start()
        else:
            # If already playing, B toggles layout mode
            is_elderly_mode = not is_elderly_mode
            ui_queue.put({"action": "redraw"})
    else:
        # Toggle Layout Mode
        is_elderly_mode = not is_elderly_mode
        ui_queue.put({"action": "redraw"})

# Register physical button listeners
gui.on_a_click(on_press_a)
gui.on_b_click(on_press_b)

# -----------------------------------------------------------------------------
# 8. Background Workers (Recording & Core API Logic)
# -----------------------------------------------------------------------------
def recording_worker():
    global current_state, record_seconds
    
    # Start audio recording
    audio.start_record(active_recording_file)
    
    max_seconds = config["max_record_seconds"]
    
    while current_state == STATE_RECORDING:
        time.sleep(1.0)
        
        # Check if user stopped recording or max duration reached
        if current_state != STATE_RECORDING:
            break
            
        record_seconds += 1
        
        # Update progress bar and timer on screen via queue
        ui_queue.put({"action": "update_timer", "seconds": record_seconds})
        
        if record_seconds >= max_seconds:
            print("Reached max recording limit, stopping automatically.")
            current_state = STATE_TRANSCRIBING
            audio.stop_record()
            break
            
    # Transition to Transcribing State
    ui_queue.put({"action": "redraw"})
    
    # Wait for file to write completely and release lock
    time.sleep(0.5)
    
    # Start API Processing Worker
    threading.Thread(target=api_processing_worker, daemon=True).start()

def api_processing_worker():
    global current_state, error_message_text
    
    if not config.get("dify_api_key"):
        error_message_text = "API Key未配置！\n请检查 config.json\n或设置 DIFY_API_KEY\n环境变量。\n\n按 A/B 键返回首页"
        current_state = STATE_ERROR
        ui_queue.put({"action": "redraw"})
        return

    # Step 1: Upload audio file to Dify File Upload API (matching web app approach)
    print("Uploading WAV to Dify /files/upload...")
    upload_url = f"{config['dify_base_url']}/files/upload"
    headers = {"Authorization": f"Bearer {config['dify_api_key']}"}
    
    try:
        if not os.path.exists(active_recording_file):
            raise FileNotFoundError(f"录音文件 {active_recording_file} 不存在。")
            
        with open(active_recording_file, "rb") as f:
            files = {"file": (active_recording_file, f, "audio/wav")}
            data = {"user": "unihiker-user"}
            
            response = requests.post(upload_url, headers=headers, files=files, data=data, timeout=30, verify=False)
            
        if response.status_code != 200 and response.status_code != 201:
            err_text = response.text
            raise Exception(f"文件上传失败 ({response.status_code}): {err_text}")
            
        res_data = response.json()
        file_id = res_data.get("id", "").strip()
        print(f"File uploaded successfully. File ID: {file_id}")
        
        if not file_id:
            raise Exception("上传成功但未返回文件ID。")
            
        # Success: transition to workflow processing with file_id
        threading.Thread(target=workflow_processing_worker, args=(file_id,), daemon=True).start()
        
    except Exception as e:
        print(f"File Upload Error: {e}")
        error_message_text = f"音频上传失败：\n{e}\n\n按A/B键返回首页"
        current_state = STATE_ERROR
        ui_queue.put({"action": "redraw"})

def clean_node_title(title):
    if not title:
        return ""
    # Hardcoded translations for known English-only nodes
    title_lower = title.lower().strip()
    mapping = {
        "insufficiency out": "材料不足输出",
        "report out": "报告输出",
        "report adjustment out": "报告修正输出",
        "mermaid out": "流程图输出",
        "mermaid generator": "流程图生成",
        "tavily search": "网络搜索",
        "url test": "链接测试",
        "url connection routing": "链接连接分流",
        "query translation": "关键词翻译",
        "prompt generator": "提示词生成",
        "variable aggregator": "变量聚合器",
        "processing image generator": "分析过程生成"
    }
    if title_lower in mapping:
        return mapping[title_lower]
        
    # Remove English alphabetical words
    cleaned = re.sub(r'[a-zA-Z]+', '', title)
    # Remove empty parentheses
    cleaned = re.sub(r'\(\s*\)', '', cleaned)
    cleaned = re.sub(r'（\s*）', '', cleaned)
    # Strip spaces
    cleaned = re.sub(r'\s+', ' ', cleaned).strip()
    
    return cleaned if cleaned else title

def save_fact_check_logs(input_audio_path, file_id, progress_logs, final_report, raw_events):
    global current_log_dir
    try:
        import shutil
        from datetime import datetime
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        current_log_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fact_check_logs", f"run_{timestamp}")
        os.makedirs(current_log_dir, exist_ok=True)
        
        # Copy input audio
        if input_audio_path and os.path.exists(input_audio_path):
            shutil.copy(input_audio_path, os.path.join(current_log_dir, "input.wav"))
            
        # Write JSON log
        log_data = {
            "timestamp": timestamp,
            "dify_file_id": file_id,
            "progress_logs": progress_logs,
            "final_report": final_report,
            "raw_stream_events": raw_events
        }
        
        log_file = os.path.join(current_log_dir, "workflow_log.json")
        with open(log_file, "w", encoding="utf-8") as f:
            json.dump(log_data, f, ensure_ascii=False, indent=2)
            
        print(f"Saved run logs to {current_log_dir}")
    except Exception as log_err:
        print(f"Failed to save run logs: {log_err}")

def workflow_processing_worker(file_id):
    global current_state, analyzing_progress, final_report_text, final_verdict, error_message_text
    
    # Step 2: Transition to Analyzing State and run Dify Workflow
    current_state = STATE_ANALYZING
    analyzing_progress = []
    raw_events = []
    chunk_texts = []
    
    # Map raw workflow node names to simple, legible Chinese phrases for elderly mode (no emojis)
    ELDERLY_NODE_MAP = {
        "start": "开始处理传言...",
        "llm": "AI正在分析传言...",
        "search": "正在全网搜集资料...",
        "google": "正在进行网上查证...",
        "knowledge": "正在核查专业知识库...",
        "format": "正在整理核查报告...",
        "template": "正在整理报告格式..."
    }
    
    def get_progress_text(node_title, node_type):
        title_lower = node_title.lower() if node_title else ""
        type_lower = node_type.lower() if node_type else ""
        
        cleaned_title = clean_node_title(node_title or node_type)
        
        if is_elderly_mode:
            # Map to simplified phrases
            for key, val in ELDERLY_NODE_MAP.items():
                if key in title_lower or key in type_lower:
                    return val
            return "系统正在努力查证中..."
        else:
            return f"[完成]: {cleaned_title}"

    ui_queue.put({"action": "redraw"})
    
    workflow_url = f"{config['dify_base_url']}/workflows/run"
    workflow_headers = {
        "Authorization": f"Bearer {config['dify_api_key']}",
        "Content-Type": "application/json"
    }
    # Build payload matching web app: pass uploaded file via upload_files, no user_text
    workflow_payload = {
        "inputs": {
            "upload_files": [
                {
                    "type": "audio",
                    "transfer_method": "local_file",
                    "upload_file_id": file_id
                }
            ],
            "user_text": "",
            "isElderlyMode": "true" if is_elderly_mode else "false"
        },
        "response_mode": "streaming",
        "user": "unihiker-user"
    }
    
    final_report_text = ""
    captured_report_text = ""
    captured_elderly_report_text = ""
    
    try:
        # Post request with streaming response, disabling SSL verification
        res = requests.post(workflow_url, headers=workflow_headers, json=workflow_payload, stream=True, timeout=60, verify=False)
        
        if res.status_code != 200:
            raise Exception(f"核查服务返回异常码 ({res.status_code})")
            
        # Parse stream line by line
        for line in res.iter_lines():
            if not line:
                continue
            decoded_line = line.decode("utf-8", errors="ignore").strip()
            if decoded_line.startswith("data: "):
                try:
                    data = json.loads(decoded_line[6:])
                    raw_events.append(data)
                    event = data.get("event")
                    event_data = data.get("data", {})
                    
                    if event == "node_finished":
                        node_title = event_data.get("title")
                        node_type = event_data.get("node_type")
                        node_id = event_data.get("node_id") or ""
                        
                        # Capture verdict from "定性裁决 Final Judge" node
                        title_str = node_title or ""
                        if "定性裁决" in title_str or "Final Judge" in title_str:
                            judge_text = (event_data.get("outputs", {}) or {}).get("text", "")
                            first_two = judge_text[:2] if judge_text else ""
                            if first_two == "证实":
                                final_verdict = "证实"
                            elif first_two == "伪造":
                                final_verdict = "谣言"
                            elif first_two == "存疑":
                                final_verdict = "存疑"
                            else:
                                final_verdict = judge_text[:4] if judge_text else "存疑"
                        
                        # Capture report texts from node_finished to avoid using mermaid outputs
                        node_outputs = event_data.get("outputs", {}) or {}
                        node_text = node_outputs.get("text", "") if isinstance(node_outputs, dict) else ""
                        if isinstance(node_text, str) and node_text.strip():
                            if any(k in title_str for k in ["Report Adjustment Out", "Report Adjustment", "报告修正"]):
                                captured_report_text = node_text.strip()
                            elif any(k in title_str for k in ["Report Out", "结束", "变量聚合器"]):
                                if not captured_report_text:
                                    captured_report_text = node_text.strip()
                            
                            if any(k in title_str for k in ["安心报告", "Elderly Report"]) or node_id == "1782465366127":
                                captured_elderly_report_text = node_text.strip()
                        
                        log_msg = get_progress_text(node_title, node_type)
                        # Add progress item if not already in list
                        if log_msg not in analyzing_progress:
                            analyzing_progress.append(log_msg)
                            ui_queue.put({"action": "redraw"})
                            
                    elif event == "text_chunk":
                        chunk = event_data.get("text", "")
                        if chunk:
                            chunk_texts.append(chunk)
                            
                    elif event == "workflow_finished":
                        outputs = event_data.get("outputs", {})
                        
                        # Prefer report text we captured from the specific end node(s)
                        result_text = ""
                        if is_elderly_mode and captured_elderly_report_text:
                            result_text = captured_elderly_report_text
                        elif captured_report_text:
                            result_text = captured_report_text
                            
                        if not result_text:
                            # Search outputs dictionary for result text, ignoring mermaid chart
                            for key in ["text", "result", "output", "response"]:
                                if key in outputs and outputs[key]:
                                    val = outputs[key]
                                    if isinstance(val, str) and not val.strip().startswith(("graph ", "flowchart ")):
                                        result_text = val.strip()
                                        break
                        if not result_text:
                            # Fallback: grab the first string value in outputs that is not mermaid
                            for val in outputs.values():
                                if isinstance(val, str) and val.strip() and not val.strip().startswith(("graph ", "flowchart ")):
                                    result_text = val.strip()
                                    break
                                    
                        if not result_text:
                            result_text = outputs.get("text", "")
                            
                        # Clean up any mermaid block if it is inside
                        if result_text and isinstance(result_text, str):
                            result_text = re.sub(r'```mermaid[\s\S]*?```', '', result_text).strip()
                            
                        final_report_text = result_text
                        break
                                    
                except Exception as stream_err:
                    print(f"Error parsing stream line: {stream_err}")
                    
        # Fallback to accumulated chunks if final_report_text is empty
        if not final_report_text and chunk_texts:
            final_report_text = "".join(chunk_texts).strip()
            
        if not final_report_text:
            final_report_text = "核查已结束，但未收到具体报告文本。"
            
        print(f"Final Report:\n{final_report_text}")
        
        # Step 3: Transition to Report Screen
        current_state = STATE_REPORT
        ui_queue.put({"action": "redraw"})
        
        # Beep twice to notify user that report is ready and waiting for playback confirmation
        ui_queue.put({"action": "beep"})
        
    except Exception as e:
        print(f"Workflow error: {e}")
        error_message_text = f"核查失败：\n{e}\n\n按A/B键返回首页"
        current_state = STATE_ERROR
        ui_queue.put({"action": "redraw"})
        
    finally:
        # Save run logs to local fact_check_logs folder
        save_fact_check_logs(
            input_audio_path=active_recording_file,
            file_id=file_id,
            progress_logs=list(analyzing_progress),
            final_report=final_report_text,
            raw_events=raw_events
        )
        


# -----------------------------------------------------------------------------
# 9. Wi-Fi Audio Streaming Server & TTS Engine
# -----------------------------------------------------------------------------

# --- Wi-Fi IP Detection ---
def get_wifi_ip():
    """Detect the board's Wi-Fi IP address for LAN streaming."""
    try:
        # Create a UDP socket to determine the outbound IP
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(2)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        pass
    # Fallback: scan network interfaces
    try:
        hostname = socket.gethostname()
        ip = socket.gethostbyname(hostname)
        if ip and not ip.startswith("127."):
            return ip
    except Exception:
        pass
    return "0.0.0.0"

WIFI_AUDIO_PORT = 5000
TTS_FILE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "report.mp3")

# --- Flask Audio Server (runs in background thread) ---
def start_wifi_audio_server():
    """Start a lightweight Flask server that serves the latest TTS audio file.
    The user's phone/computer on the same Wi-Fi can visit http://<board-ip>:5000/play
    to hear the audio through their speakers."""
    from flask import Flask, send_file, Response
    
    audio_app = Flask(__name__)
    # Suppress Flask request logging to keep console clean
    import logging
    log = logging.getLogger('werkzeug')
    log.setLevel(logging.ERROR)
    
    @audio_app.route('/')
    def index():
        """Landing page with auto-play audio player."""
        html = '''
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>谣言终结者 - 语音播报</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
            background: linear-gradient(135deg, #0f1011 0%, #001a33 100%);
            color: white;
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 2rem;
        }
        .card {
            background: rgba(255,255,255,0.08);
            backdrop-filter: blur(20px);
            border-radius: 24px;
            padding: 2.5rem;
            max-width: 420px;
            width: 100%;
            text-align: center;
            border: 1px solid rgba(255,255,255,0.1);
            box-shadow: 0 20px 60px rgba(0,0,0,0.4);
        }
        .title { font-size: 1.6rem; font-weight: 800; margin-bottom: 0.5rem; }
        .subtitle { font-size: 0.9rem; opacity: 0.6; margin-bottom: 2rem; }
        .status {
            font-size: 1.1rem;
            padding: 0.8rem 1.5rem;
            border-radius: 12px;
            margin-bottom: 1.5rem;
            font-weight: 600;
        }
        .status.ready { background: rgba(0, 179, 221, 0.2); color: #00b3dd; }
        .status.waiting { background: rgba(255, 230, 0, 0.15); color: #ffe600; }
        audio {
            width: 100%;
            margin: 1rem 0;
            border-radius: 12px;
        }
        .hint {
            font-size: 0.8rem;
            opacity: 0.4;
            margin-top: 1rem;
            line-height: 1.6;
        }
        .refresh-btn {
            margin-top: 1.5rem;
            padding: 0.8rem 2rem;
            border-radius: 12px;
            border: 1px solid rgba(255,255,255,0.2);
            background: rgba(255,255,255,0.05);
            color: white;
            font-size: 1rem;
            cursor: pointer;
            font-weight: 600;
        }
        .refresh-btn:hover { background: rgba(255,255,255,0.15); }
    </style>
</head>
<body>
    <div class="card">
        <div class="title">谣言终结者</div>
        <div class="subtitle">Wi-Fi 无线语音播报</div>
        <div id="status" class="status waiting">等待行空板生成语音...</div>
        <audio id="player" controls autoplay></audio>
        <button class="refresh-btn" onclick="checkAudio()">刷新 / 重新播放</button>
        <div class="hint">
            请确保本设备已连接音箱或外放。<br>
            行空板生成语音后，此页面将自动播放。
        </div>
    </div>
    <script>
        let lastTimestamp = 0;
        function checkAudio() {
            fetch('/status')
                .then(r => r.json())
                .then(data => {
                    const statusEl = document.getElementById('status');
                    const player = document.getElementById('player');
                    if (data.ready) {
                        // Only reload audio if timestamp changed (new audio generated)
                        if (data.timestamp !== lastTimestamp) {
                            lastTimestamp = data.timestamp;
                            statusEl.textContent = '语音已就绪，正在播放...';
                            statusEl.className = 'status ready';
                            player.src = '/play?t=' + data.timestamp;
                            player.play().catch(() => {});
                        }
                    } else {
                        statusEl.textContent = '等待行空板生成语音...';
                        statusEl.className = 'status waiting';
                        lastTimestamp = 0;
                    }
                })
                .catch(() => {});
        }
        // Poll every 3 seconds for new audio
        setInterval(checkAudio, 3000);
        // Initial check
        checkAudio();
    </script>
</body>
</html>
'''
        return Response(html, mimetype='text/html')
    
    @audio_app.route('/play')
    def play_audio():
        """Serve the latest TTS audio file."""
        if os.path.exists(TTS_FILE_PATH):
            return send_file(
                TTS_FILE_PATH,
                mimetype="audio/mpeg",
                as_attachment=False,
                download_name="report.mp3"
            )
        return "Audio file not found. Please wait for the board to generate speech.", 404
    
    @audio_app.route('/status')
    def audio_status():
        """Check if new audio is available."""
        import json as json_mod
        ready = tts_audio_ready and os.path.exists(TTS_FILE_PATH)
        ts = 0
        if ready:
            try:
                ts = int(os.path.getmtime(TTS_FILE_PATH) * 1000)
            except Exception:
                ts = int(time.time() * 1000)
        return Response(
            json_mod.dumps({"ready": ready, "timestamp": ts}),
            mimetype='application/json'
        )
    
    # Run Flask in a daemon thread so it doesn't block the main GUI loop
    audio_app.run(host='0.0.0.0', port=WIFI_AUDIO_PORT, threaded=True)

# Start the Wi-Fi audio server in a background daemon thread
_wifi_server_thread = threading.Thread(target=start_wifi_audio_server, daemon=True)
_wifi_server_thread.start()

# Detect and print the Wi-Fi streaming URL
_board_ip = get_wifi_ip()
wifi_audio_url = f"http://{_board_ip}:{WIFI_AUDIO_PORT}"
print(f"\n{'='*50}")
print(f"Wi-Fi Audio Server started!")
print(f"Open this URL on your phone/computer:")
print(f"  {wifi_audio_url}")
print(f"{'='*50}\n")

# --- TTS Synthesis & Wi-Fi Notification ---
def play_tts_report(text):
    global tts_playing, tts_audio_ready, current_log_dir
    print("Synthesizing speech report...")
    
    tts_playing = True
    tts_audio_ready = False
    ui_queue.put({"action": "redraw"})
    
    # Strip markdown headers or symbols to make the audio flow naturally
    clean_text = text.replace("#", "").replace("*", "").replace("- ", "").strip()
    
    # Limit TTS length for read performance stability (e.g. read first 250 chars if extremely long)
    if len(clean_text) > 250:
        clean_text = clean_text[:250] + "。报告完毕。"
    
    try:
        # Remove old tts file if exists
        if os.path.exists(TTS_FILE_PATH):
            try:
                os.remove(TTS_FILE_PATH)
            except Exception:
                pass
            
        # Generate speech MP3 using native edge-tts asyncio API
        import asyncio
        import edge_tts
        
        async def run_tts():
            voice = config["tts_voice"]
            communicate = edge_tts.Communicate(clean_text, voice)
            await communicate.save(TTS_FILE_PATH)
            
        asyncio.run(run_tts())
        print("TTS Speech generated successfully.")
        
        # Copy to local log directory
        if current_log_dir and os.path.exists(current_log_dir) and os.path.exists(TTS_FILE_PATH):
            try:
                import shutil
                shutil.copy(TTS_FILE_PATH, os.path.join(current_log_dir, "report.mp3"))
                print(f"Copied TTS audio to run log folder: {current_log_dir}")
            except Exception as copy_err:
                print(f"Failed to copy TTS audio to log folder: {copy_err}")
        
        # Mark audio as ready for Wi-Fi streaming
        tts_audio_ready = True
        print(f"Audio ready for streaming at: {wifi_audio_url}/play")
        print("Open this URL on your phone/computer to listen through speakers.")
        
    except Exception as e:
        print(f"TTS Synthesis failed: {e}")
        
    tts_playing = False
    ui_queue.put({"action": "redraw"})

def stop_tts_playback():
    global tts_playing, tts_audio_ready
    tts_playing = False
    tts_audio_ready = False


# -----------------------------------------------------------------------------
# 10. Thread-safe UI Poller (Main Tkinter Loop Handler)
# -----------------------------------------------------------------------------
def poll_queue():
    while not ui_queue.empty():
        try:
            msg = ui_queue.get_nowait()
            action = msg.get("action")
            
            if action == "redraw":
                redraw_screen()
            elif action == "beep":
                beep_twice()
            elif action == "update_timer":
                seconds = msg.get("seconds", 0)
                if "timer" in screen_widgets:
                    screen_widgets["timer"].config(text=f"00:{seconds:02d}")
                if "progress_bar" in screen_widgets:
                    progress_w = int((seconds / config["max_record_seconds"]) * 180)
                    screen_widgets["progress_bar"].config(w=progress_w)
                    
            ui_queue.task_done()
        except queue.Empty:
            break
        except Exception as e:
            import traceback
            tb = traceback.format_exc()
            print(f"Error in poll_queue: {tb}")
            try:
                with open("crash_log.txt", "a", encoding="utf-8") as f:
                    f.write(f"\n--- Error in poll_queue at {time.strftime('%Y-%m-%d %H:%M:%S')} ---\n{tb}\n")
            except Exception:
                pass

# Initialize Screen layout
try:
    redraw_screen()
except Exception as e:
    import traceback
    tb = traceback.format_exc()
    print(f"Initial redraw failed: {tb}")
    try:
        with open("crash_log.txt", "a", encoding="utf-8") as f:
            f.write(f"\n--- Initial redraw error ---\n{tb}\n")
    except Exception:
        pass

# Start background queue poller
if not ON_BOARD:
    gui.after(100, poll_queue)

if __name__ == "__main__":
    # Main execution loop
    if ON_BOARD:
        # On UNIHIKER board, the GUI library updates the screen automatically in the background.
        # We just need to keep the main thread alive and poll the UI update queue.
        while True:
            try:
                poll_queue()
            except Exception as e:
                import traceback
                tb = traceback.format_exc()
                print(f"Critical error in main loop: {tb}")
                try:
                    with open("crash_log.txt", "a", encoding="utf-8") as f:
                        f.write(f"\n--- Critical error in main loop at {time.strftime('%Y-%m-%d %H:%M:%S')} ---\n{tb}\n")
                except Exception:
                    pass
            time.sleep(0.05)
    else:
        # On PC, run standard Tkinter mainloop
        try:
            gui.root.mainloop()
        except Exception as e:
            import traceback
            print(traceback.format_exc())
