"""
Run this ONCE on your local machine to authenticate with Garmin and export tokens.
The output is a base64 string you paste into Render as GARTH_TOKENS env var.

Usage:
  pip install garth garminconnect
  python setup_tokens.py
"""
import base64
import getpass
import json
import os
import tempfile

import garth


def main():
    email = input("Garmin email: ").strip()
    password = getpass.getpass("Garmin password: ")

    with tempfile.TemporaryDirectory() as tmp:
        client = garth.Client()
        client.login(email, password)
        client.dump(tmp)

        files = {}
        for fname in os.listdir(tmp):
            fpath = os.path.join(tmp, fname)
            with open(fpath, "r") as f:
                files[fname] = f.read()

    token_b64 = base64.b64encode(json.dumps(files).encode()).decode()
    print("\n✅ Success! Copy the value below and set it as GARTH_TOKENS in Render:\n")
    print(token_b64)
    print()


if __name__ == "__main__":
    main()
