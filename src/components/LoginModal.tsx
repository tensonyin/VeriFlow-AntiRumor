import React, { useState } from "react";
import { motion } from "motion/react";
import { X, Mail, Lock, Eye, EyeOff, Loader2 } from "lucide-react";
import { supabase } from "../supabaseClient";

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthSuccess: (session: any) => void;
  isElderlyMode: boolean;
}

export default function LoginModal({ isOpen, onClose, onAuthSuccess, isElderlyMode }: LoginModalProps) {
  const [isLoginTab, setIsLoginTab] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  if (!isOpen) return null;

  const handleTabChange = (loginTab: boolean) => {
    setIsLoginTab(loginTab);
    setErrorMsg("");
    setSuccessMsg("");
    setPassword("");
    setConfirmPassword("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    if (!email.trim() || !password) {
      setErrorMsg("请完整填写邮箱和密码。");
      return;
    }

    if (!isLoginTab && password !== confirmPassword) {
      setErrorMsg("两次输入的密码不一致。");
      return;
    }

    if (password.length < 6) {
      setErrorMsg("密码长度至少为 6 位。");
      return;
    }

    setLoading(true);

    try {
      if (isLoginTab) {
        // Sign In
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: password,
        });

        if (error) {
          throw new Error(error.message === "Invalid login credentials" ? "邮箱或密码错误，请检查。" : error.message);
        }

        if (data.session) {
          setSuccessMsg("登录成功！正在加载您的账户信息...");
          setTimeout(() => {
            onAuthSuccess(data.session);
            onClose();
          }, 1000);
        }
      } else {
        // Sign Up
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password: password,
        });

        if (error) throw error;

        // If email confirmation is required, Supabase might not return a session immediately.
        // But for standard setups, it may auto-login or we can instruct them.
        if (data.session) {
          setSuccessMsg("注册成功并已自动登录！正在同步您的数据...");
          setTimeout(() => {
            onAuthSuccess(data.session);
            onClose();
          }, 1500);
        } else {
          setSuccessMsg("注册成功！请前往您的邮箱查收确认信以激活账户（如果已开启邮箱确认），然后在此登录。");
          // If no session but succeeded, switch tab to login after a brief display
          setTimeout(() => {
            handleTabChange(true);
          }, 3500);
        }
      }
    } catch (err: any) {
      console.error("Auth error:", err);
      setErrorMsg(err.message || "操作失败，请重试。");
    } finally {
      setLoading(false);
    }
  };

  const textClass = isElderlyMode ? "text-lg font-bold text-black" : "text-sm text-[#2C2C2C]/80";
  const titleClass = isElderlyMode ? "text-3xl font-black text-black" : "text-xl font-bold text-[#2C2C2C]";
  const inputClass = isElderlyMode 
    ? "w-full pl-10 pr-10 py-3 border-2 border-black rounded-xl text-xl font-bold bg-[#FAF8F5] text-black outline-none focus:border-green-600"
    : "w-full pl-9 pr-10 py-2.5 border border-[#d0ccc4]/60 rounded-xl text-sm bg-white/50 text-[#2C2C2C] outline-none focus:border-[#A96159] focus:bg-white transition-all";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className={`w-full max-w-md rounded-3xl p-6 sm:p-8 flex flex-col gap-6 shadow-2xl relative text-left ${
          isElderlyMode 
            ? "bg-white border-4 border-black text-black" 
            : "bg-[#FAF8F5] border border-[#d0ccc4]/50 text-[#2C2C2C]"
        }`}
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          disabled={loading}
          className={`absolute top-4 right-4 w-9 h-9 rounded-full flex items-center justify-center cursor-pointer transition-colors border-none ${
            isElderlyMode 
              ? "bg-black/5 hover:bg-black/10 text-black font-bold" 
              : "bg-[#d0ccc4]/20 hover:bg-[#d0ccc4]/40 text-[#2C2C2C]/60"
          }`}
        >
          <X className="w-5 h-5" />
        </button>

        {/* Tab Headers */}
        <div className="flex border-b border-[#d0ccc4]/30 pb-1 mt-2">
          <button
            type="button"
            onClick={() => handleTabChange(true)}
            className={`flex-1 pb-3 text-center cursor-pointer font-bold border-b-2 transition-all ${
              isLoginTab
                ? (isElderlyMode ? "border-black text-black text-2xl" : "border-[#A96159] text-[#A96159] text-base")
                : (isElderlyMode ? "border-transparent text-black/40 text-xl" : "border-transparent text-[#2C2C2C]/40 text-sm")
            }`}
          >
            登录 (Sign In)
          </button>
          <button
            type="button"
            onClick={() => handleTabChange(false)}
            className={`flex-1 pb-3 text-center cursor-pointer font-bold border-b-2 transition-all ${
              !isLoginTab
                ? (isElderlyMode ? "border-black text-black text-2xl" : "border-[#A96159] text-[#A96159] text-base")
                : (isElderlyMode ? "border-transparent text-black/40 text-xl" : "border-transparent text-[#2C2C2C]/40 text-sm")
            }`}
          >
            注册 (Sign Up)
          </button>
        </div>

        {/* Error/Success Messages */}
        {errorMsg && (
          <div className={`p-3 rounded-xl border font-bold text-left ${
            isElderlyMode 
              ? "bg-red-50 border-red-500 text-red-700 text-lg" 
              : "bg-red-50 border-red-200 text-red-600 text-xs"
          }`}>
            ⚠️ {errorMsg}
          </div>
        )}
        {successMsg && (
          <div className={`p-3 rounded-xl border font-bold text-left ${
            isElderlyMode 
              ? "bg-green-50 border-green-500 text-green-700 text-lg animate-pulse" 
              : "bg-green-50 border-green-200 text-green-600 text-xs"
          }`}>
            🎉 {successMsg}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Email */}
          <div className="flex flex-col gap-1.5">
            <label className={textClass}>电子邮箱 (Email)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 opacity-40">
                <Mail className="w-4 h-4" />
              </span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="example@mail.com"
                className={inputClass}
                required
              />
            </div>
          </div>

          {/* Password */}
          <div className="flex flex-col gap-1.5">
            <label className={textClass}>密码 (Password)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 opacity-40">
                <Lock className="w-4 h-4" />
              </span>
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="******"
                className={inputClass}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 opacity-40 hover:opacity-80 cursor-pointer border-none bg-transparent"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Confirm Password (only for register) */}
          {!isLoginTab && (
            <div className="flex flex-col gap-1.5">
              <label className={textClass}>确认密码 (Confirm Password)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 opacity-40">
                  <Lock className="w-4 h-4" />
                </span>
                <input
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="******"
                  className={inputClass}
                  required
                />
              </div>
            </div>
          )}

          {/* Submit button */}
          <button
            type="submit"
            disabled={loading}
            className={`w-full py-3.5 mt-2 rounded-xl font-bold flex items-center justify-center gap-2 cursor-pointer transition-all border-none ${
              isElderlyMode
                ? "bg-green-600 hover:bg-green-700 text-white text-2xl shadow-md"
                : "bg-[#A96159] hover:bg-[#8e4f48] text-white text-sm shadow-sm"
            } disabled:opacity-55 disabled:cursor-not-allowed`}
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>{isLoginTab ? "正在登录..." : "正在注册..."}</span>
              </>
            ) : (
              <span>{isLoginTab ? "立即登录 (Sign In)" : "提交注册 (Sign Up)"}</span>
            )}
          </button>
        </form>

        {/* Tip / Footer info */}
        {isLoginTab && !isElderlyMode && (
          <div className="text-[11px] text-[#2C2C2C]/50 text-center leading-relaxed mt-1">
            提示：注册新账号即可获赠 10 次核查额度。
            游客状态下核查将扣除访客 3 次免费额度。
          </div>
        )}
      </motion.div>
    </div>
  );
}
