import { visit } from "unist-util-visit";
import type { Code } from "mdast";
import type { Node } from "unist";

function parseParams(paramString = ""): Record<string, string> {
  const normalized = paramString.replace(/ /g, "&");
  return Object.fromEntries(new URLSearchParams(normalized).entries());
}

function transformNode(node: Code) {
  const params = parseParams(node.meta ?? undefined);
  const encodedCode = encodeURIComponent(node.value);

  const attributes = [
    { type: "mdxJsxAttribute", name: "code", value: encodedCode },
    { type: "mdxJsxAttribute", name: "src", value: params.video },
  ];

  if ("audio" in params) {
    attributes.push({ type: "mdxJsxAttribute", name: "hasAudio", value: "true" });
  }

  const jsxNode = {
    type: "mdxJsxFlowElement",
    name: "VideoExample",
    attributes,
    children: [],
  };

  Object.assign(node, jsxNode as unknown as Node);
}

export default function remarkVideoExample() {
  return (tree: Node) => {
    visit(tree, "code", (node: Node) => {
      if ("lang" in node && node.lang === "VideoExample") {
        transformNode(node as unknown as Code);
      }
    });
  };
}
