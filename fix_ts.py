#!/usr/bin/env python3
import re

filepath = r"c:\Users\noman\OneDrive\Desktop\crypto website\crypto-dashboard\src\lib\chart\detectPattern.ts"

with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

# Check if points field already exists in the content
if "points:" in content:
    print("Points field already exists in file")
else:
    print("Points field needs to be added")

# Find the Triple Top function return statement and add points
# We need to find "confidence: 82," followed by the note and closing brace
# in the detectTripleTop function

# Strategy: find the pattern and add points after the note line
# The pattern result has: pattern, type, confidence, note, and optionally points

# Let's search for the Triple Top return and add points
# Looking for: confidence: 82, note about "Three consecutive pivots" and closing }

# For Triple Top - find and add points after the note
# The note text is unique: "Three consecutive pivots at similar price levels with breakdown below neckline — bearish continuation."

# Let's use a regex to find the return block and add points
# Pattern: confidence: 82, followed by note text, followed by closing }

# For Triple Top
triple_top_return_start = content.find("function detectTripleTop(")
if triple_top_return_start >= 0:
    # Get the section after detectTripleTop function start
    triple_top_section = content[triple_top_return_start:triple_top_return_start + 3000]
    
    # Find confidence: 82 in this section
    conf_idx = triple_top_section.find("confidence: 82,")
    if conf_idx >= 0:
        print(f"Found confidence: 82 in Triple Top section at offset {conf_idx}")
        
        # Find the note after it
        note_start = triple_top_section.find("note: `", conf_idx)
        if note_start >= 0:
            print(f"Found note at offset {note_start}")
            
            # Find the closing } of the return statement
            # We need to find the matching closing brace
            after_note = triple_top_section[note_start:]
            brace_count = 0
            close_idx = -1
            for i, ch in enumerate(after_note):
                if ch == '{':
                    brace_count += 1
                elif ch == '}':
                    brace_count -= 1
                    if brace_count == 0:
                        close_idx = i
                        break
            
            if close_idx >= 0:
                print(f"Found closing brace at offset {close_idx} within after_note")
                
                # The section we want to modify is from confidence to the closing brace
                # Extract the old return block
                old_return = triple_top_section[conf_idx:note_start + after_note.index('`') + 1 + close_idx + 1]
                
                print(f"Old return length: {len(old_return)}")
                print(f"Old return ends with: ...{old_return[-50:]}")
                
                # Add points before the closing brace
                points_insert = ',\\n    points: { p1: { time: 0, price: 0 }, p2: { time: 0, price: 0 }, p3: { time: 0, price: 0 }, neckline: 0 }'
                
                # Insert points before the closing brace
                new_return = old_return.replace(
                    '`,\\s+\\};',
                    points_insert + '`,\\n};'
                )
                
                print(f"New return: ...{new_return[-60:]}")
                
                # Replace in the original content
                # This is getting complex - let's try a simpler approach
                # Just insert the points line after the note line
                
# Similar logic for Triple Bottom...
print("Script completed")