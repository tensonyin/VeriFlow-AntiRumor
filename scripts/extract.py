import zipfile
import os

zip_path = 'release_gcp.zip'
print(f"Opening zip file {zip_path}...")

with zipfile.ZipFile(zip_path, 'r') as zip_ref:
    for member in zip_ref.infolist():
        # Clean path formatting
        clean_name = member.filename.replace('\\', '/')
        if clean_name.startswith('./'):
            clean_name = clean_name[2:]
            
        target_path = os.path.abspath(os.path.join('.', clean_name))
        
        # Security check: prevent directory traversal
        current_dir = os.path.abspath('.')
        if not target_path.startswith(current_dir):
            print(f"Skipping potentially unsafe file: {member.filename}")
            continue
            
        if member.is_dir() or clean_name.endswith('/'):
            os.makedirs(target_path, exist_ok=True)
        else:
            # Ensure folder exists
            os.makedirs(os.path.dirname(target_path), exist_ok=True)
            with open(target_path, 'wb') as f_out:
                f_out.write(zip_ref.read(member.filename))
                
print("Extraction completed successfully!")
