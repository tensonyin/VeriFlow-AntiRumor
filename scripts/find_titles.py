import yaml
import json

with open('谣言终结者：基于多源异构对抗博弈的多模态事实核查系统 (6).yml', 'r', encoding='utf-8') as f:
    data = yaml.safe_load(f)

nodes = data.get('workflow', {}).get('graph', {}).get('nodes', [])
with open('node_titles.txt', 'w', encoding='utf-8') as out:
    for n in nodes:
        title = n.get('data', {}).get('title') or n.get('title')
        out.write(f"{title}\n")
