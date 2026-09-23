import { vi } from 'vitest';

// A real File/Response boundary in memory; never contacts Base44 or the network.
export function privateStorageFixture() {
  const files = new Map<string, File>();
  const core = {
    UploadPrivateFile: vi.fn(async ({ file }) => {
      const file_uri = 'private/test-' + (files.size + 1);
      files.set(file_uri, file);
      return { file_uri };
    }),
    CreateFileSignedUrl: vi.fn(async ({ file_uri }) => {
      if (!files.has(file_uri)) throw Error('file missing');
      return { signed_url: 'https://storage.invalid/' + file_uri };
    }),
  };
  vi.stubGlobal('fetch', vi.fn(async url => {
    const key = String(url).replace('https://storage.invalid/', '');
    const file = files.get(key);
    return file ? new Response(await file.arrayBuffer()) : new Response(null, { status: 404 });
  }));
  const readState = async ref => typeof ref === 'string' && ref.startsWith('uri:')
    ? JSON.parse(await files.get(ref.slice(4)).text()) : ref;
  return { files, core, readState, storage: {
    uploadPrivateFile: core.UploadPrivateFile,
    createSignedUrl: core.CreateFileSignedUrl,
  } };
}
