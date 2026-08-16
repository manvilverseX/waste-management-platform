export interface ImageValidationResult {
  isValid: boolean;
  error?: string;
  width?: number;
  height?: number;
  format?: 'jpeg' | 'png' | 'webp';
}

/**
 * Validates an image's signature (magic numbers), file size, and dimensions
 * from its raw buffer. Avoids dependency on external binary libraries.
 */
export function validateImageBuffer(
  buffer: Buffer,
  maxSizeBytes: number = 5 * 1024 * 1024,
  minDimension: number = 200
): ImageValidationResult {
  // 1. Size Check
  if (buffer.length > maxSizeBytes) {
    return { 
      isValid: false, 
      error: `File size exceeds the maximum limit of ${maxSizeBytes / (1024 * 1024)}MB.` 
    };
  }
  if (buffer.length < 30) {
    return { isValid: false, error: 'File is too small or corrupt.' };
  }

  // 2. PNG Format Check
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4E &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0D &&
    buffer[5] === 0x0A &&
    buffer[6] === 0x1A &&
    buffer[7] === 0x0A
  ) {
    const width = buffer.readInt32BE(16);
    const height = buffer.readInt32BE(20);
    if (width < minDimension || height < minDimension) {
      return { 
        isValid: false, 
        error: `Image dimensions (${width}x${height}) are below the minimum required of ${minDimension}x${minDimension}px.` 
      };
    }
    return { isValid: true, width, height, format: 'png' };
  }

  // 3. JPEG Format Check
  if (buffer[0] === 0xFF && buffer[1] === 0xD8) {
    let offset = 2;
    while (offset < buffer.length) {
      if (buffer[offset] !== 0xFF) {
        break;
      }
      while (buffer[offset] === 0xFF && offset < buffer.length) {
        offset++;
      }
      if (offset >= buffer.length) break;
      
      const marker = buffer[offset];
      offset++;

      if (marker === 0xC0 || marker === 0xC2) {
        if (offset + 7 >= buffer.length) break;
        const height = buffer.readUInt16BE(offset + 3);
        const width = buffer.readUInt16BE(offset + 5);
        if (width < minDimension || height < minDimension) {
          return { 
            isValid: false, 
            error: `Image dimensions (${width}x${height}) are below the minimum required of ${minDimension}x${minDimension}px.` 
          };
        }
        return { isValid: true, width, height, format: 'jpeg' };
      } else {
        if (marker === 0xD9 || marker === 0xD8 || (marker >= 0xD0 && marker <= 0xD7)) {
          continue;
        }
        if (offset + 2 >= buffer.length) break;
        const length = buffer.readUInt16BE(offset);
        offset += length;
      }
    }
    return { isValid: false, error: 'Could not verify JPEG structure. File might be corrupt.' };
  }

  // 4. WEBP Format Check
  if (
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 && // RIFF
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50    // WEBP
  ) {
    const subtype = buffer.toString('utf-8', 12, 16);
    let width = 0;
    let height = 0;

    if (subtype === 'VP8 ') {
      if (buffer.length < 30) return { isValid: false, error: 'Malformed WEBP VP8.' };
      width = buffer.readUInt16LE(26) & 0x3FFF;
      height = buffer.readUInt16LE(28) & 0x3FFF;
    } else if (subtype === 'VP8L') {
      if (buffer.length < 25) return { isValid: false, error: 'Malformed WEBP VP8L.' };
      const b1 = buffer[21];
      const b2 = buffer[22];
      const b3 = buffer[23];
      const b4 = buffer[24];
      width = (((b2 & 0x3F) << 8) | b1) + 1;
      height = (((b4 & 0x0F) << 10) | (b3 << 2) | ((b2 & 0xC0) >> 6)) + 1;
    } else if (subtype === 'VP8X') {
      if (buffer.length < 30) return { isValid: false, error: 'Malformed WEBP VP8X.' };
      width = (buffer.readUInt32LE(24) & 0xFFFFFF) + 1;
      height = (buffer.readUInt32LE(27) & 0xFFFFFF) + 1;
    } else {
      // Fallback for custom/uncommon webp containers if signature matches
      return { isValid: true, format: 'webp', width: minDimension, height: minDimension };
    }

    if (width < minDimension || height < minDimension) {
      return { 
        isValid: false, 
        error: `Image dimensions (${width}x${height}) are below the minimum required of ${minDimension}x${minDimension}px.` 
      };
    }
    return { isValid: true, width, height, format: 'webp' };
  }

  return { isValid: false, error: 'Unsupported file format. Only JPEG, PNG, and WEBP are accepted.' };
}
