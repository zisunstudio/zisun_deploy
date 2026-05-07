import os
import zipfile

def zipdir(path, ziph):
    # ziph is zipfile handle
    exclude_dirs = {'node_env', 'venv', '__pycache__', 'node_modules', '.next', '.git'}
    for root, dirs, files in os.walk(path):
        # modify dirs in place to skip excluded directories
        dirs[:] = [d for d in dirs if d not in exclude_dirs]
        for file in files:
            if file.endswith('.zip'):
                continue
            file_path = os.path.join(root, file)
            ziph.write(file_path, os.path.relpath(file_path, path))

if __name__ == '__main__':
    zipf = zipfile.ZipFile('zisun_platform.zip', 'w', zipfile.ZIP_DEFLATED)
    zipdir('.', zipf)
    zipf.close()
    print("Zipped successfully.")
