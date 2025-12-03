import * as THREE from 'three';

export function createQueryHandler(app, sceneManager, ui) {
    const queryCache = new Map();

    const handler = {
        getSceneMetadata,
        localQueryHandler,
        handleQuerySend,
        normalizeQuestion
    };

    return handler;

    function normalizeQuestion(q) {
        return q.trim().toLowerCase();
    }

    function getSceneMetadata() {
        const files = [];
        app.loadedFiles.forEach((fileData, filename) => {
            if (!fileData.geometry) return;
            const geometry = fileData.geometry; geometry.computeBoundingBox(); const bbox = geometry.boundingBox;
            const center = new THREE.Vector3(); bbox.getCenter(center);
            files.push({ filename, visible: !!fileData.visible, vertex_count: geometry.attributes.position.count, bbox: { min: bbox.min.toArray(), max: bbox.max.toArray(), size: bbox.getSize(new THREE.Vector3()).toArray(), center: center.toArray() } });
        });
        return files;
    }

    function localQueryHandler(question) {
        const q = normalizeQuestion(question);
        if (queryCache.has(q)) return { handled: true, data: queryCache.get(q) };
        const sceneFiles = getSceneMetadata(); const filenamesLower = sceneFiles.map(f => f.filename.toLowerCase());
        const responseData = { success: true, question, sql: null, results: [], columns: [], row_count: 0 };
        let match = q.match(/how many (?:of )?([\w\s-]+)s?\b/);
        if (!match) match = q.match(/count (?:the )?(\w+)s?\b/);
        if (match) {
            let object = match[1]; object = object.trim().toLowerCase(); if (object.endsWith('s')) object = object.slice(0, -1);
            const count = filenamesLower.filter(f => f.includes(object)).length; responseData.results=[{object, count}]; responseData.columns=['object','count']; responseData.row_count=1; queryCache.set(q, responseData); return { handled: true, data: responseData };
        }
        match = q.match(/is there (?:a|an|the )?([\w\s-]+)/);
        if (match) {
            let object = match[1]; object = object.trim().toLowerCase(); if (object.endsWith('s')) object = object.slice(0, -1);
            let exists = filenamesLower.some(f => f.includes(object));
            if (app.sceneInfo && app.sceneInfo._map) {
                const lower = object.toLowerCase(); const entry = app.sceneInfo._map.get(lower); exists = Boolean(entry) || sceneFiles.some(f => f.filename.toLowerCase().includes(lower));
                if (entry) {
                    responseData.results = [{ object, exists: true, filename: entry.filename }]; responseData.columns=['object','exists','filename']; responseData.row_count=1; queryCache.set(q, responseData); return { handled: true, data: responseData };
                }
            }
            responseData.results = [{ object, exists }]; responseData.columns = ['object','exists']; responseData.row_count = 1; queryCache.set(q, responseData); return { handled: true, data: responseData };
        }
        match = q.match(/where is (?:a|an|the )?([\w\s-]+)/);
        if (match) {
            let object = match[1]; object = object.trim().toLowerCase(); if (object.endsWith('s')) object = object.slice(0, -1);
            if (app.sceneInfo && app.sceneInfo._map) {
                const lower = object.toLowerCase(); let entry = app.sceneInfo._map.get(lower);
                if (!entry) { for (const [k, v] of app.sceneInfo._map.entries()) { if (k.includes(lower) || lower.includes(k)) { entry = v; break; } } }
                if (entry) {
                    let center = [0,0,0]; let size = [1,1,1];
                    if (entry.filename) {
                        const f = sceneFiles.find(ff => ff.filename.toLowerCase().includes(String(entry.filename).toLowerCase())); if (f) { center = f.bbox.center; size = f.bbox.size; }
                    }
                    const bboxInfo = app.sceneInfo.bounding_box && app.sceneInfo.bounding_box[entry.key]; if (bboxInfo) size = [bboxInfo.x || size[0], bboxInfo.y || size[1], bboxInfo.z || size[2]];
                    responseData.results=[{ object: entry.key, center, size, filename: entry.filename }]; responseData.columns = ['object','center','size']; responseData.row_count=1; queryCache.set(q, responseData); return { handled: true, data: responseData };
                } else { responseData.results=[{ object, exists: false }]; responseData.columns=['object','exists']; responseData.row_count=1; queryCache.set(q, responseData); return { handled: true, data: responseData }; }
            } else { let file = sceneFiles.find(f => f.filename.toLowerCase().includes(object)); if (file) { responseData.results=[{ object, center: file.bbox.center, size: file.bbox.size, filename: file.filename }]; responseData.columns=['object','center','size']; responseData.row_count=1; queryCache.set(q, responseData); return { handled: true, data: responseData }; } }
        }
        match = q.match(/vertex count (?:of )?(?:the )?([\w\s-]+)|how many vertices (?:in|for) ([\w\s-]+)/);
        if (match) {
            const object = (match[1] || match[2] || '').trim().toLowerCase(); const file = sceneFiles.find(f => f.filename.toLowerCase().includes(object)); if (file) { responseData.results=[{ object: file.filename, vertex_count: file.vertex_count }]; responseData.columns=['object','vertex_count']; responseData.row_count=1; queryCache.set(q, responseData); return { handled: true, data: responseData }; }
        }
        return { handled: false };
    }

    async function handleQuerySend() {
        const queryInput = document.getElementById('query-input'); if (!queryInput) return; const query = queryInput.value.trim(); if (query === '') return;
        console.log('Query submitted:', query);
        const querySendBtn = document.getElementById('query-send-btn'); const originalBtnHTML = querySendBtn ? querySendBtn.innerHTML : null; if (querySendBtn) { querySendBtn.innerHTML = '<div class="spinner"></div>'; querySendBtn.disabled = true; }
        try {
            const localResponse = localQueryHandler(query);
            if (localResponse && localResponse.handled) {
                const first = localResponse.data.results && localResponse.data.results[0];
                if (first && (first.center || first.size || first.filename)) {
                    let filename = first.filename;
                    if (filename) {
                        const f = Array.from(app.loadedFiles.entries()).find(([name, fd]) => name.toLowerCase() === String(filename).toLowerCase() || fd.filepath.toLowerCase().endsWith(String(filename).toLowerCase()));
                        if (f) {
                            const [name, fd] = f;
                            if (fd.geometry) {
                                fd.geometry.computeBoundingBox(); const center = fd.geometry.boundingBox.getCenter(new THREE.Vector3()).toArray(); const size = fd.geometry.boundingBox.getSize(new THREE.Vector3()).toArray(); sceneManager.createHighlightBox({ name, filename: name, center, size });
                            } else {
                                sceneManager.createHighlightBox({ name: filename, filename, center: first.center || [0,0,0], size: first.size || [1,1,1] });
                            }
                        } else {
                            sceneManager.createHighlightBox({ name: filename, filename, center: first.center || [0,0,0], size: first.size || [1,1,1] });
                        }
                    } else {
                        sceneManager.createHighlightBox({ name: first.object, filename: first.object, center: first.center || [0,0,0], size: first.size || [1,1,1] });
                    }
                } else if (first && first.exists !== undefined) {
                    const existsMsg = first.exists ? `Yes, ${first.object} is present.` : `No, ${first.object} is not present.`; if (ui) ui.showInlineQueryMessage(existsMsg, first.exists ? 'success' : 'error');
                } else if (localResponse.data && localResponse.data.results && localResponse.data.results.length > 0) {
                    const row = localResponse.data.results[0]; const keys = Object.keys(row || {}); if (keys.length > 0) { const msg = keys.map(k => `${k}: ${row[k]}`).join(', '); if (ui) ui.showInlineQueryMessage(msg, 'info'); }
                } else {
                    if (ui) ui.showInlineQueryMessage('No results found.', 'error');
                }
            } else {
                if (ui) ui.showInlineQueryMessage('No results found.', 'error');
            }
        } finally {
            if (querySendBtn) { querySendBtn.innerHTML = originalBtnHTML; querySendBtn.disabled = false; }
            queryInput.value = '';
        }
    }
}
