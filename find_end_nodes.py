import yaml
import json

with open('谣言终结者：基于多源异构对抗博弈的多模态事实核查系统 (8).yml', 'r', encoding='utf-8') as f:
    data = yaml.safe_load(f)

nodes = data.get('workflow', {}).get('graph', {}).get('nodes', [])
for n in nodes:
    title = n.get('data', {}).get('title') or n.get('title')
    node_type = n.get('data', {}).get('type') or n.get('type')
    if node_type == 'end':
         print(f"End Node: {title}")
         print(json.dumps(n.get('data', {}).get('outputs'), indent=2, ensure_ascii=False))

