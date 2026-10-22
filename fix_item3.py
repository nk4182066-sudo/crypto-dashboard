#!/usr/bin/env python3
import re

filepath = r"c:\Users\noman\OneDrive\Desktop\crypto website\crypto-dashboard\src\lib\chart\detectPattern.ts"

with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

# Find detectTripleTop function
triple_top_start = content.find("function detectTripleTop")
triple_bottom_start = content.find("function detectTripleBottom")

print(f"detectTripleTop starts at index: {triple_top_start}")
print(f"detectTripleBottom starts at index: {triple_bottom_start}")

# Find the return statements in these functions
# Strategy: find "return {" after these function definitions and add points

# Let's search for the pattern "return {" near the Triple Top function
search_start = triple_top_start
return_pos = content.find("return {", search_start)
print(f"First 'return #' after detectTripleTop at: {return_pos}")

# Similarly for Triple Bottom
search_start2 = triple_bottom_start
return_pos2 = content.find("return {", search_start2)
print(f"First 'return #' after detectTripleBottom at: {return_pos2}")

# Now let's look at what's around these return statements
if return_pos > 0:
    context = content[return_pos:return_pos+200]
    print(f"Context around return: {context}")

if return_pos2 > 0:
    context2 = content[return_pos2:return_pos2+200]
    print(f"Context around return (Bottom): {context2}")

# Now let's add points to the return statements
# We need to find "return {" and add points before the closing }

# For detectTripleTop - find the return statement and add points
# The pattern result should have: pattern, type, confidence, note, points

# Let's look for specific return patterns in the Triple Top/Bottom functions
# by searching for key phrases

# Print some surrounding lines to understand the structure
lines = content.split('\n')
for i, line in enumerate(lines):
    if 'detectTripleTop' in line or 'detectTripleBottom' in line or 'return {' in line:
        if i < 1000:  # just first 1000 lines
            print(f"Line {i+1}: {line[:100]}")