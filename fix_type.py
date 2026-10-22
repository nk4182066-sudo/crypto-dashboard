#!/usr/bin/env python3
import re

filepath = r"c:\Users\noman\OneDrive\Desktop\crypto website\crypto-dashboard\app\api\chat\route.ts"

with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

# Change AutoAnalysis to AnalyzeResult - only in the buildEngineBlock function context
# Find and replace the specific pattern
old_pattern = "let analysis: AutoAnalysis;"
new_pattern = "let analysis: AnalyzeResult;"

# Only replace if it's followed by the analyzeCoin call pattern
if old_pattern in content:
    # Simple replacement
    new_content = content.replace(old_pattern, new_pattern, 1)  # Replace only first occurrence
    if new_content != content:
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(new_content)
        print("Successfully replaced AutoAnalysis with AnalyzeResult")
    else:
        print("Replacement didn't change content")
else:
    print("Pattern not found")