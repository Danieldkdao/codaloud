/** Keep output bounded and readable in native text. */
export const appendTerminalOutput = (current: string, chunk: string) => {
  const plain = chunk
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "");
  let output = current;
  for (let index = 0; index < plain.length; index++) {
    const char = plain[index];
    if (char === "\b") output = output.slice(0, -1);
    else if (char === "\r" && plain[index + 1] !== "\n")
      output = output.slice(0, output.lastIndexOf("\n") + 1);
    else if (char !== "\r") output += char;
  }
  return output.slice(-100_000);
};

export const appendTerminalCommand = (current: string, command: string) =>
  appendTerminalOutput(
    current,
    `${current && !current.endsWith("\n") ? "\n" : ""}$ ${command}\n`,
  );
