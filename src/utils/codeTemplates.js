function normalizeLanguage(language) {
  return String(language || "python").trim().toLowerCase();
}

function pythonTemplate(platform) {
  const fn = "solve";
  if (platform === "gfg") {
    return `# User function Template for python3\nclass Solution:\n    def ${fn}(self, arr, target):\n        # Write your logic here\n        pass\n`;
  }

  if (platform === "hackerrank") {
    return `def ${fn}():\n    # Parse input and write your logic here\n    pass\n\nif __name__ == \"__main__\":\n    ${fn}()\n`;
  }

  return `class Solution:\n    def ${fn}(self, nums, target):\n        # Write your logic here\n        pass\n`;
}

function javascriptTemplate(platform) {
  const fn = "solve";
  if (platform === "gfg") {
    return `// User function Template for javascript\nclass Solution {\n  ${fn}(arr, target) {\n    // Write your logic here\n  }\n}\n`;
  }

  if (platform === "hackerrank") {
    return `function ${fn}(input) {\n  // Parse input and write your logic here\n}\n\nprocess.stdin.resume();\nprocess.stdin.setEncoding(\"utf-8\");\nlet input = \"\";\nprocess.stdin.on(\"data\", chunk => input += chunk);\nprocess.stdin.on(\"end\", () => ${fn}(input));\n`;
  }

  return `class Solution {\n  ${fn}(nums, target) {\n    // Write your logic here\n  }\n}\n`;
}

function javaTemplate(platform) {
  if (platform === "gfg") {
    return `// User function Template for Java\nclass Solution {\n    public int[] solve(int[] arr, int target) {\n        // Write your logic here\n        return new int[]{-1, -1};\n    }\n}\n`;
  }

  if (platform === "hackerrank") {
    return `import java.io.*;\n\npublic class Solution {\n    static void solve() {\n        // Parse input and write your logic here\n    }\n\n    public static void main(String[] args) throws Exception {\n        solve();\n    }\n}\n`;
  }

  return `class Solution {\n    public int[] solve(int[] nums, int target) {\n        // Write your logic here\n        return new int[]{-1, -1};\n    }\n}\n`;
}

function cppTemplate(platform) {
  if (platform === "gfg") {
    return `// User function Template for C++\nclass Solution {\n  public:\n    vector<int> solve(vector<int>& arr, int target) {\n        // Write your logic here\n        return {-1, -1};\n    }\n};\n`;
  }

  if (platform === "hackerrank") {
    return `#include <bits/stdc++.h>\nusing namespace std;\n\nvoid solve() {\n    // Parse input and write your logic here\n}\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n\n    solve();\n    return 0;\n}\n`;
  }

  return `class Solution {\n  public:\n    vector<int> solve(vector<int>& nums, int target) {\n        // Write your logic here\n        return {-1, -1};\n    }\n};\n`;
}

function cTemplate(platform) {
  if (platform === "hackerrank") {
    return `#include <stdio.h>\n\nvoid solve() {\n    // Parse input and write your logic here\n}\n\nint main() {\n    solve();\n    return 0;\n}\n`;
  }

  return `int* solve(int* nums, int numsSize, int target, int* returnSize) {\n    // Write your logic here\n    *returnSize = 2;\n    return NULL;\n}\n`;
}

export function getStarterCode({ platform = "leetcode", language = "python" }) {
  const p = String(platform || "leetcode").toLowerCase();
  const lang = normalizeLanguage(language);

  if (lang.includes("python")) return pythonTemplate(p);
  if (lang.includes("javascript") || lang === "js") return javascriptTemplate(p);
  if (lang.includes("java")) return javaTemplate(p);
  if (lang.includes("c++") || lang.includes("cpp")) return cppTemplate(p);
  if (lang === "c") return cTemplate(p);

  return `// Language template not configured for ${language}\n// Write your logic here\n`;
}

export const PLATFORM_OPTIONS = [
  { value: "leetcode", label: "LeetCode" },
  { value: "gfg", label: "GeeksforGeeks" },
  { value: "hackerrank", label: "HackerRank" }
];
