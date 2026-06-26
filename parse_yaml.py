import yaml

with open('谣言终结者：基于多源异构对抗博弈的多模态事实核查系统 (6).yml', 'r', encoding='utf-8') as f:
    data = yaml.safe_load(f)

nodes = data.get('workflow', {}).get('graph', {}).get('nodes', [])
for n in nodes:
    node_type = n.get('data', {}).get('type') or n.get('type')
    if node_type == 'end':
        title = n.get('data', {}).get('title') or n.get('title')
        outputs = n.get('data', {}).get('outputs') or n.get('outputs')
        print(f"End Node: {title}")
        print(f"Outputs: {outputs}")
