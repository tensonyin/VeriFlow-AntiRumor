import re
import json

html_file = r'd:\Desktop\谣言终结者\谣言终结者：基于多源异构对抗博弈的多模态事实核查系统 - Dify.html'
with open(html_file, 'r', encoding='utf-8') as f:
    content = f.read()

# Find all JSON-like structures that might define variables
matches = re.findall(r'"user_input_form"\s*:\s*\[(.*?)\]', content, re.DOTALL)
if matches:
    print("Found user_input_form:")
    print(matches[0][:1000])

matches = re.findall(r'"variables"\s*:\s*\[(.*?)\]', content, re.DOTALL)
if matches:
    print("Found variables:")
    for match in matches:
        if 'image' in match or 'file' in match:
            print(match[:500])

# Find any keys containing file
file_keys = re.findall(r'"([^"]*file[^"]*)"', content, re.IGNORECASE)
print("Keys with 'file':", set(file_keys))
