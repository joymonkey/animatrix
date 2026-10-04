Import("env")
import os
import shutil

# Get build paths
build_dir = env.subst("$BUILD_DIR")
bootloader = os.path.join(build_dir, "bootloader.bin")
partitions = os.path.join(build_dir, "partitions.bin")
firmware = os.path.join(build_dir, "firmware.bin")
littlefs = os.path.join(build_dir, "littlefs.bin")

# Target website folder (go up from firmware/animatrix to root ledMatrix)
target_dir = os.path.abspath(os.path.join(env.subst("$PROJECT_DIR"), "..", "..", "website", "firmware"))

def copy_binaries(*args, **kwargs):
    print(f"\n[Animatrix] Copying compiled binaries to website folder: {target_dir}")
    os.makedirs(target_dir, exist_ok=True)
    
    files_to_copy = [bootloader, partitions, firmware, littlefs]
    
    for f in files_to_copy:
        if os.path.exists(f):
            shutil.copy(f, target_dir)
            print(f" -> Copied {os.path.basename(f)}")
        else:
            print(f" -> Skipped {os.path.basename(f)} (not found - build LittleFS separately using 'Build FS')")
            
    print("[Animatrix] Web Flashing binaries updated successfully!\n")

# Run this script after every firmware build
env.AddPostAction("buildprog", copy_binaries)
env.AddPostAction("$BUILD_DIR/littlefs.bin", copy_binaries)
