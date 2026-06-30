import yaml
import json
import os

yml_file = 'dify_workflows/谣言终结者：基于多源异构对抗博弈的多模态事实核查系统 (12).yml'
if not os.path.exists(yml_file):
    # Try finding any yml in dify_workflows
    files = [f for f in os.listdir('dify_workflows') if f.endswith('.yml')]
    if files:
        yml_file = os.path.join('dify_workflows', files[0])
        print(f"Using fallback YML: {yml_file}")
    else:
        print("No YML files found!")
        exit(1)

with open(yml_file, 'r', encoding='utf-8') as f:
    data = yaml.safe_load(f)

nodes = data.get('workflow', {}).get('graph', {}).get('nodes', [])

print(f"Total nodes found: {len(nodes)}")

prompts_data = []

for n in nodes:
    node_id = n.get('id')
    node_data = n.get('data', {})
    title = node_data.get('title')
    node_type = node_data.get('type')
    
    prompt = None
    
    # Check LLM prompt templates
    if node_type == 'llm':
        prompt_templates = node_data.get('prompt_template', [])
        if isinstance(prompt_templates, list):
            prompts = []
            for p in prompt_templates:
                role = p.get('role', 'system')
                text = p.get('text', '')
                prompts.append(f"### Role: {role}\n{text}")
            prompt = "\n\n".join(prompts)
        elif isinstance(prompt_templates, str):
            prompt = prompt_templates
            
    # Check Agent instructions
    elif node_type == 'agent':
        agent_params = node_data.get('agent_parameters', {})
        instruction_data = agent_params.get('instruction', {})
        if isinstance(instruction_data, dict):
            prompt = instruction_data.get('value', '')
        else:
            prompt = str(instruction_data)
            
    # Check Code block
    elif node_type == 'code':
        prompt = node_data.get('code', '')
        
    # Check Parameter extractor
    elif node_type == 'parameter-extractor':
        prompt = node_data.get('instruction', '')
        
    # Check Question classifier
    elif node_type == 'question-classifier':
        classes = node_data.get('classes', [])
        classes_str = "\n".join([f"- {c.get('name')}: {c.get('id')}" for c in classes])
        instruction = node_data.get('instruction', '')
        prompt = f"Instruction: {instruction}\n\nClasses:\n{classes_str}"

    if prompt:
        prompts_data.append({
            'id': node_id,
            'title': title,
            'type': node_type,
            'prompt': prompt.strip()
        })

print(f"Extracted prompts for {len(prompts_data)} nodes.")

# Save as json to load easily or write to md
with open('scripts/extracted_prompts.json', 'w', encoding='utf-8') as out:
    json.dump(prompts_data, out, ensure_ascii=False, indent=2)

print("Done! Extracted prompts written to scripts/extracted_prompts.json")
