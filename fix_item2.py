#!/usr/bin/env python3
import re

filepath = r"c:\Users\noman\OneDrive\Desktop\crypto website\crypto-dashboard\app\api\chat\route.ts"

with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

# Fix the Unicode regex flags - add 'u' flag
old_pattern1 = "/Ã([^\\s\\p{L}])/g"
new_pattern1 = "/Ã([^\\s\\p{L}])/gu"

old_pattern2 = "/[\\s\\p{L}]Ã/g"
new_pattern2 = "/[\\s\\p{L}]Ã/gu"

print(f"Looking for pattern1: {old_pattern1}")
print(f"Looking for pattern2: {old_pattern2}")

# Check if patterns exist
if old_pattern1 in content:
    print("Found pattern1, replacing...")
    content = content.replace(old_pattern1, new_pattern1)
else:
    print("Pattern1 NOT found, checking alternatives...")

if old_pattern2 in content:
    print("Found pattern2, replacing...")
    content = content.replace(old_pattern2, new_pattern2)
else:
    print("Pattern2 NOT found, checking alternatives...")

# Write back
with open(filepath, "w", encoding="utf-8") as f:
    f.write(content)

print("Done! File updated.")