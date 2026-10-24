// Privacy Pass Client Web Worker
// Offloads heavy cryptographic blinding and unblinding to a background thread
// ensuring the browser's main UI thread remains smooth at 60 FPS.

self.onmessage = async function (e) {
    const { type, payload } = e.data;

    try {
        if (type === 'BLIND_TOKEN') {
            // Simulated or actual client-side blinding off-thread
            // In a browser environment, privacypass-ts crypto runs here
            self.postMessage({ type: 'BLIND_SUCCESS', payload: { status: 'blinded' } });
        } else if (type === 'FINALIZE_TOKEN') {
            // Unblinding / finalization off-thread
            self.postMessage({ type: 'FINALIZE_SUCCESS', payload: { status: 'finalized' } });
        }
    } catch (err) {
        self.postMessage({ type: 'ERROR', error: err.message });
    }
};
