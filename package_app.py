import zipfile
import os

def zip_dir(dir_path, zip_file_path, exclude_dirs=None, exclude_files=None):
    if exclude_dirs is None:
        exclude_dirs = []
    if exclude_files is None:
        exclude_files = []
        
    with zipfile.ZipFile(zip_file_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for root, dirs, files in os.walk(dir_path):
            # Modify dirs list in-place to exclude specified directories from recursion
            dirs[:] = [d for d in dirs if d not in exclude_dirs]
            
            for file in files:
                if file in exclude_files:
                    continue
                file_path = os.path.join(root, file)
                rel_path = os.path.relpath(file_path, dir_path)
                zipf.write(file_path, rel_path)

if __name__ == "__main__":
    workspace = os.path.dirname(os.path.abspath(__file__))
    
    # 1. Package frontend compiled 'dist' files
    frontend_dist = os.path.join(workspace, "frontend", "dist")
    frontend_zip = os.path.join(workspace, "frontend.zip")
    if os.path.exists(frontend_dist):
        print(f"Packaging frontend build from {frontend_dist} to {frontend_zip}...")
        zip_dir(frontend_dist, frontend_zip)
        print("Frontend package created successfully!")
    else:
        print("Frontend dist/ directory not found! Run npm run build first.")
        
    # 2. Package backend app files
    backend_dir = os.path.join(workspace, "backend")
    backend_zip = os.path.join(workspace, "backend.zip")
    if os.path.exists(backend_dir):
        print(f"Packaging backend from {backend_dir} to {backend_zip}...")
        # Exclude temporary cache directories and test scripts
        zip_dir(
            backend_dir, 
            backend_zip, 
            exclude_dirs=["__pycache__", ".pytest_cache"], 
            exclude_files=["check_mysql.py"]
        )
        print("Backend package created successfully!")
    else:
        print("Backend directory not found!")
