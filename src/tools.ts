export const TOOLS = [
  { type: "function", function: { name: "read_file", description: "Read file with line numbers",
    parameters: { type: "object", properties: {
      path: { type: "string" }, offset: { type: "integer" }, limit: { type: "integer" } },
      required: ["path"] } } },
  { type: "function", function: { name: "write_file", description: "Create or overwrite file",
    parameters: { type: "object", properties: {
      path: { type: "string" }, content: { type: "string" } },
      required: ["path", "content"] } } },
  { type: "function", function: { name: "edit_file", description: "Replace unique substring in file",
    parameters: { type: "object", properties: {
      path: { type: "string" }, old_string: { type: "string" }, new_string: { type: "string" } },
      required: ["path", "old_string", "new_string"] } } },
  { type: "function", function: { name: "list_dir", description: "List directory",
    parameters: { type: "object", properties: { path: { type: "string" } } } } },
  { type: "function", function: { name: "bash", description: "Run shell command in workdir",
    parameters: { type: "object", properties: { command: { type: "string" } },
      required: ["command"] } } },
] as const;

export const CMD: Record<string, string> = {
  read_file: "tool_read_file",
  write_file: "tool_write_file",
  edit_file: "tool_edit_file",
  list_dir: "tool_list_dir",
  bash: "tool_bash",
};
