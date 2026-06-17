import requests

# The URL of your local IPFS API
url = 'http://127.0.0.1:5001/api/v0/add'

# The file you want to upload (replace 'test_video.mp4' with any file)
files = {'file': open('test_video.mp4', 'rb')}

# Sending the request to IPFS
response = requests.post(url, files=files)

if response.status_code == 200:
    print("Upload Successful!")
    print("CID:", response.json()['Hash'])
else:
    print("Upload Failed. Check if daemon is running.")