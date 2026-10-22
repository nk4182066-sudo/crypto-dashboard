#!/usr/bin/env python3
import re

filepath = r"c:\Users\noman\OneDrive\Desktop\crypto website\crypto-dashboard\src\lib\chart\detectPattern.ts"

with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

# Find detectTripleTop function and add points to return statement
# The pattern returns an object, we need to add points field

# Look for the return statements in detectTripleTop and detectTripleBottom
# and add points: { p1: { time, price }, p2: { time, price }, p3: { time, price }, neckline }

# First, let's find where detectTripleTop starts
triple_top_idx = content.find("function detectTripleTop")
triple_bottom_idx = content.find("function detectTripleBottom")

print(f"detectTripleTop found at: {triple_top_idx}")
print(f"detectTripleBottom found at: {triple_bottom_idx}")

# Let's search for the return { ... } in these functions and add points
# Strategy: find "return {" near these functions and add points before the closing }

# For now, let's just verify the PatternResult interface has points field
if '"points"' in content:
    print("PatternResult interface already has 'points' field defined")
else:
    print("PatternResult interface MISSING 'points' field")

# Check the current points definition in the interface
points_match = re.search(r'points:\s*\?:\s*\{[^}]+\}', content)
if points_match:
    print(f"Found points in interface: {points_match.group()}")
else:
    print("No points pattern found in interface - need to add it")

# Let's search for return statements in the Triple Top/Bottom functions
# and add points to them