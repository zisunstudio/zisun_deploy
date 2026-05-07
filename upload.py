import paramiko
import sys
import os

host = '10.118.249.11'
user = 'root'
password = '9!B1tQJpU#'
local_file = 'zisun_platform.zip'
remote_file = '/root/zisun_platform.zip'

try:
    print(f"Connecting to {host}...")
    transport = paramiko.Transport((host, 22))
    transport.connect(username=user, password=password)
    
    sftp = paramiko.SFTPClient.from_transport(transport)
    print(f"Uploading {local_file} to {remote_file}...")
    sftp.put(local_file, remote_file)
    print("Upload complete!")
    sftp.close()
    transport.close()

    # Now execute unzip command
    print("Executing unzip on the remote server...")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(host, username=user, password=password)
    
    commands = [
        "rm -rf /root/ZISUN_Platform",
        "mkdir -p /root/ZISUN_Platform",
        "apt-get update && apt-get install -y unzip", # Ensure unzip is installed
        "unzip -o /root/zisun_platform.zip -d /root/ZISUN_Platform",
        "rm /root/zisun_platform.zip"
    ]
    
    for cmd in commands:
        print(f"Running: {cmd}")
        stdin, stdout, stderr = ssh.exec_command(cmd)
        exit_status = stdout.channel.recv_exit_status()          # Blocking call
        if exit_status == 0:
            print("Success")
        else:
            print(f"Error: {stderr.read().decode('utf-8')}")

    ssh.close()
    print("Remote extraction complete! Codebase is ready at /root/ZISUN_Platform")
except Exception as e:
    print(f"An error occurred: {e}")
