#!/usr/bin/env python3
import re

filepath = r"c:\Users\noman\OneDrive\Desktop\crypto website\crypto-dashboard\src\lib\chart\detectPattern.ts"

with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

# Find and update detectTripleTop return statement to include points
# The pattern needs to add points: { p1: { time, price }, p2: { time, price }, p3: { time, price }, neckline }
# to the return statement

# First, let's find the detectTripleTop function and its return
# Looking for the return statement pattern

# Strategy: find "return {" in detectTripleTop and add points field
# But we need to be careful - let's search for the specific patterns

# Let's look for "detectTripleTop" function and its return
triple_top_marker = "detectTripleTop"
triple_bottom_marker = "detectTripleBottom"

# Find locations
top_pos = content.find(triple_top_marker)
bottom_pos = content.find(triple_bottom_marker)

print(f"Triple Top found at position: {top_pos}")
print(f"Triple Bottom found at position: {bottom_pos}")

# For now, let's just verify the PatternResult interface has points field
# and the code structure
if '"points"' in content:
    print("PatternResult interface already has 'points' field defined")
else:
    print("PatternResult interface MISSING 'points' field")

# Check if the return statements have points
# The PatternResult interface at line 47 already defines points?
points_in_interface = re.search(r'points:\s*\?:\s*\{[^}]+\}', content)
if points_in_interface:
    print(f"Found points in interface: {points_in_interface.group()}")
else:
    print("No points pattern found in interface")