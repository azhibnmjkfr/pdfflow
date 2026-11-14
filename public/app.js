let pdfDoc = null;
let activePageNum = 1;
let scale = 1.5;
let fabricCanvas = null;
let imageTTDUrl = null;
let pageSizeInMm = { w: 0, h: 0 };
let pagesData = {}; 

// Variabel untuk menyimpan pasangan Kotak & Teks
let linkedTextPairs = [];

// --- SISTEM UNDO / REDO ---
let history = [];
let historyIndex = -1;
let isHistoryAction = false;

function saveHistory() {
    if (isHistoryAction) return;
    const json = JSON.stringify(fabricCanvas.toJSON());
    if (historyIndex < history.length - 1) history = history.slice(0, historyIndex + 1);
    history.push(json);
    historyIndex++;
}

function undo() {
    if (historyIndex > 0) {
        isHistoryAction = true;
        historyIndex--;
        fabricCanvas.loadFromJSON(history[historyIndex], function() {
            fabricCanvas.requestRenderAll();
            isHistoryAction = false;
            rebuildLinkedPairs(); 
        });
    }
}

function redo() {
    if (historyIndex < history.length - 1) {
        isHistoryAction = true;
        historyIndex++;
        fabricCanvas.loadFromJSON(history[historyIndex], function() {
            fabricCanvas.requestRenderAll();
            isHistoryAction = false;
            rebuildLinkedPairs();
        });
    }
}

window.addEventListener('keydown', function(e) {
    if (!fabricCanvas) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || (fabricCanvas.getActiveObject() && fabricCanvas.getActiveObject().isEditing)) return; 

    if (e.key === 'Delete' || e.key === 'Backspace') {
        deleteSelected(); e.preventDefault();
    } else if (e.ctrlKey && e.key.toLowerCase() === 'z') {
        undo(); e.preventDefault();
    } else if (e.ctrlKey && e.key.toLowerCase() === 'y') {
        redo(); e.preventDefault();
    }
});

function initFabric() {
    if (fabricCanvas) fabricCanvas.dispose();
    linkedTextPairs = []; 
    
    const container = document.getElementById('canvas-container');
    const width = pageSizeInMm.w * scale * 72 / 25.4;
    const height = pageSizeInMm.h * scale * 72 / 25.4;
    
    container.style.width = width + 'px';
    container.style.height = height + 'px';
    
    fabricCanvas = new fabric.Canvas('c', {
        width: width,
        height: height,
        backgroundColor: 'rgba(0,0,0,0)',
        preserveObjectStacking: true
    });

    fabricCanvas.on('selection:created', handleSelection);
    fabricCanvas.on('selection:updated', handleSelection);
    fabricCanvas.on('selection:cleared', () => {
        document.getElementById('textTools').style.display = 'none';
    });

    // Sinkronisasi pergerakan
    fabricCanvas.on('object:moving', syncLinkedObjects);
    fabricCanvas.on('object:scaling', syncLinkedObjects);
    fabricCanvas.on('object:rotating', syncLinkedObjects);

    // Event untuk mendeteksi double click
    fabricCanvas.on('mouse:dblclick', handleDoubleClick);

    // Event saat mulai mengedit teks (sembunyikan kotak)
    fabricCanvas.on('text:editing:entered', function(e) {
        const textObj = e.target;
        const pair = linkedTextPairs.find(p => p.text === textObj);
        if (pair && pair.rect) {
            pair.rect.set('opacity', 0); // Transparan
            fabricCanvas.requestRenderAll();
        }
    });

    // Event saat selesai mengedit teks (munculkan kotak)
    fabricCanvas.on('text:editing:exited', function(e) {
        const textObj = e.target;
        const pair = linkedTextPairs.find(p => p.text === textObj);
        if (pair && pair.rect) {
            pair.rect.set('opacity', 1); // Kembali solid
            fabricCanvas.requestRenderAll();
        }
        saveHistory();
    });

    history = []; historyIndex = -1; saveHistory();
}

// Fungsi merapikan posisi Teks & Kotak
function syncLinkedObjects(e) {
    const activeObj = e.target;
    if (!activeObj) return;

    const pair = linkedTextPairs.find(p => p.rect === activeObj || p.text === activeObj);
    if (!pair) return;

    const isDraggingRect = (activeObj === pair.rect);
    const source = activeObj;
    const target = isDraggingRect ? pair.text : pair.rect;

    if (isDraggingRect) {
        target.set({ left: source.left, top: source.top, angle: source.angle });
    } else {
        source.set({ left: source.left, top: source.top });
    }
}

function rebuildLinkedPairs() {
    linkedTextPairs = [];
    const objects = fabricCanvas.getObjects();
    for (let i = 0; i < objects.length; i++) {
        if (objects[i].type === 'rect' && objects[i].isBackground) {
            if (objects[i+1] && objects[i+1].type === 'i-text') {
                linkedTextPairs.push({ rect: objects[i], text: objects[i+1] });
            }
        }
    }
}

if (typeof fabric !== 'undefined') {
    fabric.Object.prototype.on('modified', saveHistory);
    fabric.Object.prototype.on('added', saveHistory);
    fabric.Object.prototype.on('removed', saveHistory);
}

function getVisibleCenter() {
    const scrollArea = document.getElementById('canvas-scroll-area');
    let centerX = scrollArea.scrollLeft + (scrollArea.clientWidth / 2) - fabricCanvas._offset.left;
    let centerY = scrollArea.scrollTop + (scrollArea.clientHeight / 2) - fabricCanvas._offset.top;
    return { x: centerX, y: centerY };
}

// FUNGSI BARU: Deteksi Double Click
function handleDoubleClick(e) {
    if (!e.target) return;
    const target = e.target;
    
    // Jika yang diklik adalah kotak putih, cari teks di atasnya
    if (target.type === 'rect') {
        const pair = linkedTextPairs.find(p => p.rect === target);
        if (pair && pair.text) {
            fabricCanvas.setActiveObject(pair.text);
            pair.text.enterEditing(); // Langsung masuk mode ketik
            fabricCanvas.requestRenderAll();
        }
    } else if (target.type === 'i-text') {
        // Jika teks langsung yang diklik
        target.enterEditing();
    }
}

function handleSelection(e) {
    const activeObj = fabricCanvas.getActiveObject();
    if (activeObj && activeObj.type === 'i-text') {
        document.getElementById('textTools').style.display = 'flex';
        document.getElementById('fontSize').value = Math.round(activeObj.fontSize);
        document.getElementById('btnBold').classList.toggle('active', activeObj.fontWeight === 'bold');
        document.getElementById('btnItalic').classList.toggle('active', activeObj.fontStyle === 'italic');
        document.getElementById('btnUnderline').classList.toggle('active', activeObj.underline);
    } else {
        document.getElementById('textTools').style.display = 'none';
    }
}

function toggleFormat(type) {
    const activeObj = fabricCanvas.getActiveObject();
    if (!activeObj || activeObj.type !== 'i-text') return;

    if (type === 'bold') {
        activeObj.set('fontWeight', activeObj.fontWeight === 'bold' ? 'normal' : 'bold');
        document.getElementById('btnBold').classList.toggle('active');
    } else if (type === 'italic') {
        activeObj.set('fontStyle', activeObj.fontStyle === 'italic' ? 'normal' : 'italic');
        document.getElementById('btnItalic').classList.toggle('active');
    } else if (type === 'underline') {
        activeObj.set('underline', !activeObj.underline);
        document.getElementById('btnUnderline').classList.toggle('active');
    }
    fabricCanvas.requestRenderAll();
    saveHistory();
}

function changeFontSize(size) {
    const activeObj = fabricCanvas.getActiveObject();
    if (activeObj && activeObj.type === 'i-text') {
        activeObj.set('fontSize', parseInt(size));
        fabricCanvas.requestRenderAll();
        saveHistory();
    }
}

async function changePage(direction) {
    const newPage = activePageNum + direction;
    if (newPage >= 1 && newPage <= pdfDoc.numPages) {
        pagesData[activePageNum] = JSON.stringify(fabricCanvas.toJSON());
        activePageNum = newPage;
        document.getElementById('pageIndicator').innerText = `Hal ${activePageNum} / ${pdfDoc.numPages}`;
        await renderPdfPage(activePageNum);
        document.getElementById('canvas-scroll-area').scrollTo(0,0);
    }
}

async function renderPdfPage(pageNum) {
    const page = await pdfDoc.getPage(pageNum);
    const vp = page.getViewport({ scale: scale });
    const vp1 = page.getViewport({ scale: 1 });
    pageSizeInMm.w = (vp1.width / 72) * 25.4;
    pageSizeInMm.h = (vp1.height / 72) * 25.4;

    initFabric();

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = vp.width; tempCanvas.height = vp.height;
    await page.render({ canvasContext: tempCanvas.getContext('2d'), viewport: vp }).promise;
    
    fabric.Image.fromURL(tempCanvas.toDataURL(), function(img) {
        fabricCanvas.setBackgroundImage(img, fabricCanvas.renderAll.bind(fabricCanvas), {
            scaleX: fabricCanvas.width / img.width,
            scaleY: fabricCanvas.height / img.height
        });

        if (pagesData[pageNum]) {
            fabricCanvas.loadFromJSON(pagesData[pageNum], function() {
                fabricCanvas.requestRenderAll(); 
                rebuildLinkedPairs();
                saveHistory();
            });
        }
    });
}

document.getElementById('pdfFile').onchange = async e => {
    const buf = await e.target.files[0].arrayBuffer();
    pdfDoc = await pdfjsLib.getDocument({ data: buf }).promise;
    document.getElementById('editor-container').style.display = 'flex'; 
    document.getElementById('btnSubmit').disabled = false;
    activePageNum = 1;
    document.getElementById('pageIndicator').innerText = `Hal 1 / ${pdfDoc.numPages}`;
    pagesData = {};
    await renderPdfPage(1); 
};

document.getElementById('ttdFile').onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(f) { 
        imageTTDUrl = f.target.result; 
        document.getElementById('ttd-preview-img').src = imageTTDUrl;
        document.getElementById('ttd-preview-wrapper').style.display = 'block';
    };
    reader.readAsDataURL(file);
};

function addWhiteBox() {
    const center = getVisibleCenter();
    const rect = new fabric.Rect({
        left: center.x, top: center.y, originX: 'center', originY: 'center', 
        fill: '#ffffff', width: 200, height: 60, stroke: '#dc3545', strokeWidth: 1
    });
    fabricCanvas.add(rect);
    fabricCanvas.setActiveObject(rect);
}

function addText() {
    const center = getVisibleCenter();
    
    const bg = new fabric.Rect({
        left: center.x, top: center.y, 
        originX: 'center', originY: 'center',
        fill: '#ffffff', width: 250, height: 50,
        stroke: '#cbd5e1', strokeWidth: 1
    });
    bg.isBackground = true; 

    const text = new fabric.IText('Ketik Teks...', {
        left: center.x, top: center.y,
        originX: 'center', originY: 'center',
        fontFamily: 'Helvetica, Arial, sans-serif', fontSize: 18, fill: 'black'
    });

    fabricCanvas.add(bg);
    fabricCanvas.add(text);
    linkedTextPairs.push({ rect: bg, text: text });

    // Langsung fokus ke teks
    fabricCanvas.setActiveObject(text);
    text.enterEditing(); 
    
    // Sembunyikan kotak saat mulai mengetik
    bg.set('opacity', 0);
    fabricCanvas.requestRenderAll();
}

function addImage() {
    if (!imageTTDUrl) { alert('Upload gambar TTD baru terlebih dahulu!'); return; }
    const center = getVisibleCenter();
    fabric.Image.fromURL(imageTTDUrl, function(img) {
        img.scaleToWidth(150);
        img.set({ left: center.x, top: center.y, originX: 'center', originY: 'center' });
        fabricCanvas.add(img);
        fabricCanvas.setActiveObject(img);
    });
}

function deleteSelected() {
    const activeObjects = fabricCanvas.getActiveObjects();
    if (activeObjects.length) {
        fabricCanvas.discardActiveObject();
        activeObjects.forEach(obj => {
            const pair = linkedTextPairs.find(p => p.rect === obj || p.text === obj);
            if (pair) {
                const partner = pair.rect === obj ? pair.text : pair.rect;
                fabricCanvas.remove(partner);
                linkedTextPairs = linkedTextPairs.filter(p => p !== pair);
            }
            fabricCanvas.remove(obj);
        });
        document.getElementById('textTools').style.display = 'none';
        saveHistory();
    }
}

// SUBMIT KE PHP DENGAN TRIK RENDER TEKS KE GAMBAR
function submitPreview() {
    if (!pdfDoc) return;
    
    // Pastikan kotak putih dikembalikan ke opacity 1 sebelum disubmit
    linkedTextPairs.forEach(pair => {
        if(pair.rect) pair.rect.set('opacity', 1);
    });

    document.getElementById('loadingOverlay').classList.add('active');

    pagesData[activePageNum] = JSON.stringify(fabricCanvas.toJSON());
    const mmPerPx = pageSizeInMm.w / fabricCanvas.width;
    let allObjectsData = [];

    for (const pageStr in pagesData) {
        const pageNum = parseInt(pageStr);
        const canvasJson = JSON.parse(pagesData[pageStr]);
        
        if (canvasJson.objects && canvasJson.objects.length > 0) {
            
            function extractObjects(objects) {
                objects.forEach(obj => {
                    if (obj.type === 'group') {
                        extractObjects(obj.objects);
                    } else if (obj.type === 'i-text') {
                        const textW = obj.width * obj.scaleX;
                        const textH = obj.height * obj.scaleY;
                        
                        const tempCanvas = document.createElement('canvas');
                        tempCanvas.width = textW; tempCanvas.height = textH;
                        const ctx = tempCanvas.getContext('2d');
                        
                        const clonedText = new fabric.IText(obj.text, {
                            left: 0, top: 0, originX: 'left', originY: 'top',
                            fontFamily: obj.fontFamily, fontSize: obj.fontSize, 
                            fontWeight: obj.fontWeight, fontStyle: obj.fontStyle, underline: obj.underline,
                            fill: obj.fill, scaleX: obj.scaleX, scaleY: obj.scaleY
                        });
                        clonedText.render(ctx);
                        
                        const textImageBase64 = tempCanvas.toDataURL({ format: 'png' });
                        const left = obj.left - (obj.width / 2);
                        const top = obj.top - (obj.height / 2);

                        allObjectsData.push({
                            page: pageNum, type: 'text_image', content: textImageBase64,
                            x: left * mmPerPx, y: top * mmPerPx, w: textW * mmPerPx, h: textH * mmPerPx
                        });
                        
                    } else {
                        let type = obj.type;
                        let content = '';
                        if (type === 'image') content = 'TTD_IMAGE';

                        const width = obj.width * obj.scaleX;
                        const height = obj.height * obj.scaleY;
                        const left = obj.left - (width / 2);
                        const top = obj.top - (height / 2);

                        allObjectsData.push({
                            page: pageNum, type: type, content: content,
                            x: left * mmPerPx, y: top * mmPerPx, w: width * mmPerPx, h: height * mmPerPx
                        });
                    }
                });
            }
            extractObjects(canvasJson.objects);
        }
    }
    document.getElementById('zones').value = JSON.stringify({ objects: allObjectsData });

    const form = document.getElementById('form');
    const formData = new FormData(form);

    fetch('index.php', {
        method: 'POST', body: formData, headers: { 'X-Requested-With': 'XMLHttpRequest' }
    })
    .then(response => response.json())
    .then(data => {
        document.getElementById('loadingOverlay').classList.remove('active');
        if (data.success) {
            const fileUrl = 'storage/out/' + data.file;
            document.getElementById('pdfPreviewFrame').src = fileUrl;
            document.getElementById('btnDownloadFinal').href = fileUrl;
            document.getElementById('previewModal').classList.add('active');
        } else { alert("Gagal memproses: " + data.message); }
    })
    .catch(error => {
        document.getElementById('loadingOverlay').classList.remove('active');
        alert("Terjadi kesalahan sistem saat memproses PDF.");
        console.error(error);
    });
}

function closePreview() {
    document.getElementById('previewModal').classList.remove('active');
    setTimeout(() => { document.getElementById('pdfPreviewFrame').src = ''; }, 300);
}