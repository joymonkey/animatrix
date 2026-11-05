Import("env")
import os
import shutil
import json
import subprocess

# Get build paths
build_dir = env.subst("$BUILD_DIR")
bootloader = os.path.join(build_dir, "bootloader.bin")
partitions = os.path.join(build_dir, "partitions.bin")
firmware = os.path.join(build_dir, "firmware.bin")

# Target website folder (go up from firmware/animatrix to root ledMatrix)
website_dir = os.path.abspath(os.path.join(env.subst("$PROJECT_DIR"), "..", "..", "website"))
target_dir = os.path.join(website_dir, "firmware")
manifest_path = os.path.join(website_dir, "manifest.json")

def copy_binaries(*args, **kwargs):
    print(f"\n[Animatrix] Copying compiled binaries to website folder: {target_dir}")
    os.makedirs(target_dir, exist_ok=True)
    
    files_to_copy = [bootloader, partitions, firmware]
    
    for f in files_to_copy:
        if os.path.exists(f):
            shutil.copy(f, target_dir)
            print(f" -> Copied {os.path.basename(f)}")
        else:
            print(f" -> Skipped {os.path.basename(f)} (not found)")
            
    # Automatically synchronize manifest.json with the current dynamic version
    try:
        git_rev = subprocess.check_output(
            ["git", "describe", "--tags", "--always", "--dirty"],
            cwd=env.subst("$PROJECT_DIR")
        ).decode("utf-8").strip()
        if not git_rev.startswith("v"):
            git_rev = f"v1.3.0-{git_rev}"
    except Exception:
        git_rev = "v1.3.0"

    if os.path.exists(manifest_path):
        try:
            with open(manifest_path, "r", encoding="utf-8") as f:
                manifest = json.load(f)
            manifest["version"] = git_rev
            with open(manifest_path, "w", encoding="utf-8") as f:
                json.dump(manifest, f, indent=2)
            print(f" -> Updated website/manifest.json version to: {git_rev}")
        except Exception as e:
            print(f" -> Failed to update manifest.json: {e}")

    print("[Animatrix] Web Flashing binaries updated successfully!\n")

# Run this script after every firmware build
env.AddPostAction("buildprog", copy_binaries)
