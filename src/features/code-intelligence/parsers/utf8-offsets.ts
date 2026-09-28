// Tree-sitter grammars and the native language runtimes report positions as
// byte offsets into the UTF-8 encoding of the source, while the editor indexes
// the JavaScript string in UTF-16 code units. Any runtime that speaks bytes
// needs this translation, so it lives here rather than inside a single parser.

const utf8LengthOfCodePoint = (codePoint: number) => {
  if (codePoint <= 0x7f) return 1;
  if (codePoint <= 0x7ff) return 2;
  if (codePoint <= 0xffff) return 3;
  return 4;
};

// Walk the source once, recording where each requested byte offset lands in
// UTF-16 space. Offsets that fall in the middle of a multi-byte sequence, or
// past the end of the source, are intentionally absent from the result: callers
// treat a missing entry as "cannot map this finding" and drop it rather than
// reporting a position that points at the wrong character.
export const mapUtf8OffsetsToUtf16 = (
  content: string,
  offsets: readonly number[],
) => {
  const uniqueOffsets = [...new Set(offsets)].sort(
    (left, right) => left - right,
  );
  const mappedOffsets = new Map<number, number>();
  let offsetIndex = 0;
  let byteOffset = 0;
  let utf16Offset = 0;

  for (const codePoint of content) {
    while (uniqueOffsets[offsetIndex] === byteOffset) {
      mappedOffsets.set(uniqueOffsets[offsetIndex], utf16Offset);
      offsetIndex++;
    }

    byteOffset += utf8LengthOfCodePoint(codePoint.codePointAt(0)!);
    utf16Offset += codePoint.length;
    while (uniqueOffsets[offsetIndex] === byteOffset) {
      mappedOffsets.set(uniqueOffsets[offsetIndex], utf16Offset);
      offsetIndex++;
    }
  }

  return mappedOffsets;
};

// Byte length of the source once encoded as UTF-8. Native runtimes report
// lengths in the same units as their offsets, so converting a span's end
// offset to a length is a subtraction of two byte offsets.
export const getUtf8ByteLength = (content: string) => {
  let length = 0;
  for (const codePoint of content) {
    length += utf8LengthOfCodePoint(codePoint.codePointAt(0)!);
  }
  return length;
};
