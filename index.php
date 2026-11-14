<?php
require __DIR__ . '/vendor/autoload.php';

if (!is_dir(__DIR__ . '/storage/out')) {
    mkdir(__DIR__ . '/storage/out', 0777, true);
}

$error = null;

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_FILES['pdf'])) {
    $in  = $_FILES['pdf']['tmp_name'];
    $ttd = $_FILES['ttd']['tmp_name'] ?? null;
    $zones = json_decode($_POST['zones'], true);

    $out = __DIR__ . '/storage/out/' . uniqid('hasil_') . '.pdf';

    try {
        // 1. Simpan Gambar TTD (jika ada)
        $tmpTtd = null;
        if ($ttd) {
            $tmpTtd = __DIR__ . '/storage/out/ttd_' . uniqid() . '.png';
            move_uploaded_file($ttd, $tmpTtd);
        }

        // 2. Simpan Gambar Teks (Base64) ke file fisik
        if (isset($zones['objects'])) {
            foreach ($zones['objects'] as &$obj) {
                if ($obj['type'] === 'text_image') {
                    $base64_string = str_replace('data:image/png;base64,', '', $obj['content']);
                    $base64_string = str_replace(' ', '+', $base64_string);
                    $data = base64_decode($base64_string);
                    
                    $textImgPath = __DIR__ . '/storage/out/text_' . uniqid() . '.png';
                    file_put_contents($textImgPath, $data);
                    
                    // Ubah tipe menjadi image biasa agar diproses PHP
                    $obj['type'] = 'image';
                    $obj['content'] = $textImgPath;
                }
            }
        }

        // 3. Proses PDF
        Src\PdfEditor::process($in, $tmpTtd, $out, $zones);
        
        // 4. Bersihkan file sementara
        if ($tmpTtd && file_exists($tmpTtd)) unlink($tmpTtd);
        foreach ($zones['objects'] as $obj) {
            if ($obj['type'] === 'image' && strpos($obj['content'], 'text_') !== false) {
                if (file_exists($obj['content'])) unlink($obj['content']);
            }
        }

        // Respon AJAX
        if (!empty($_SERVER['HTTP_X_REQUESTED_WITH']) && strtolower($_SERVER['HTTP_X_REQUESTED_WITH']) == 'xmlhttprequest') {
            echo json_encode(['success' => true, 'file' => basename($out)]);
            exit;
        }

        header("Location: storage/out/" . basename($out));
        exit;

    } catch (Exception $e) {
        if (!empty($_SERVER['HTTP_X_REQUESTED_WITH'])) {
            echo json_encode(['success' => false, 'message' => $e->getMessage()]);
            exit;
        }
        $error = "Gagal memproses: " . $e->getMessage();
    }
}
?>
<!doctype html>
<html lang="id">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>pdfFlow - Secure PDF Editor</title>
    <link rel="stylesheet" href="public/style.css">
</head>
<body>

    <header class="app-header">
        <div class="logo-area">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <path d="M16 13H8"></path><path d="M16 17H8"></path><path d="M10 9H8"></path>
            </svg>
            <div><h1>pdfFlow</h1><span class="brand-tagline">by Azhco</span></div>
        </div>
        
        <form method="post" enctype="multipart/form-data" id="form" class="upload-form">
            <div class="file-upload-wrapper">
                <input type="file" name="pdf" accept="application/pdf" required id="pdfFile" class="file-input">
                <label for="pdfFile" class="file-label">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                    Pilih PDF
                </label>
                <span id="fileNameDisplay" class="file-name">Belum ada file</span>
            </div>
            
            <div class="file-upload-wrapper">
                <input type="file" name="ttd" accept="image/png, image/jpeg" id="ttdFile" class="file-input">
                <label for="ttdFile" class="file-label">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                    Upload TTD
                </label>
                <span id="ttdNameDisplay" class="file-name">Belum ada TTD</span>
            </div>
            
            <input type="hidden" name="zones" id="zones">
            <button type="button" id="btnSubmit" disabled class="btn-primary" onclick="submitPreview()">Preview PDF</button>
        </form>
    </header>

    <main class="app-body" id="editor-container" style="display: none;">
        <aside class="sidebar">
            <div class="sidebar-section" style="padding-bottom: 10px; border-bottom: 1px solid var(--border-color);">
                <div class="format-row">
                    <button type="button" onclick="undo()" title="Undo (Ctrl+Z)" style="flex: 1; padding: 8px;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7v6h6"></path><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"></path></svg>
                    </button>
                    <button type="button" onclick="redo()" title="Redo (Ctrl+Y)" style="flex: 1; padding: 8px;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 7v6h-6"></path><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7"></path></svg>
                    </button>
                </div>
            </div>

            <div class="sidebar-section">
                <h3>Navigasi Halaman</h3>
                <div class="pdf-nav">
                    <button type="button" class="btn-nav" onclick="changePage(-1)" id="prevBtn"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"></polyline></svg></button>
                    <span id="pageIndicator" class="page-indicator">Hal 1 / 1</span>
                    <button type="button" class="btn-nav" onclick="changePage(1)" id="nextBtn"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg></button>
                </div>
            </div>

            <div class="sidebar-section">
                <h3>Alat Edit</h3>
                <div class="btn-group">
                    <button type="button" class="tool-btn" onclick="addWhiteBox()">
                        <span class="tool-icon bg-gray"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg></span> 
                        Tutup Area Saja
                    </button>
                    <button type="button" class="tool-btn" onclick="addText()">
                        <span class="tool-icon bg-blue"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 7 4 4 20 4 20 7"></polyline><line x1="9" y1="20" x2="15" y2="20"></line><line x1="12" y1="4" x2="12" y2="20"></line></svg></span> 
                        Teks + Kotak Putih
                    </button>
                </div>
            </div>

            <div class="sidebar-section" id="ttd-preview-wrapper" style="display: none;">
                <h3>Tanda Tangan Anda</h3>
                <div class="ttd-preview-box" onclick="addImage()">
                    <img id="ttd-preview-img" src="" alt="Preview TTD">
                    <div class="ttd-preview-overlay"><span>+ Klik untuk Tempel</span></div>
                </div>
            </div>

            <div class="sidebar-section text-tools" id="textTools">
                <h3>Format Teks</h3>
                <div class="format-row">
                    <button type="button" id="btnBold" onclick="toggleFormat('bold')"><b>B</b></button>
                    <button type="button" id="btnItalic" onclick="toggleFormat('italic')"><i>I</i></button>
                    <button type="button" id="btnUnderline" onclick="toggleFormat('underline')"><u>U</u></button>
                </div>
                <div class="format-row" style="margin-top: 12px;">
                    <label>Ukuran</label>
                    <input type="number" id="fontSize" value="18" min="8" max="72" onchange="changeFontSize(this.value)">
                </div>
            </div>

            <div class="sidebar-section" style="display: flex; gap: 8px;">
                <button type="button" class="btn-secondary" onclick="groupSelected()" style="flex:1;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg> Gabung</button>
                <button type="button" class="btn-secondary" onclick="ungroupSelected()" style="flex:1; background:#fef2f2; color:#dc2626; border-color:#fecaca;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4l16 16"></path><path d="M4 20L20 4"></path></svg> Pisah</button>
            </div>

            <button type="button" class="btn-danger" onclick="deleteSelected()">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                Hapus Objek
            </button>
        </aside>

        <section class="canvas-area" id="canvas-scroll-area">
            <div class="canvas-wrapper" id="canvas-container">
                <canvas id="c"></canvas>
            </div>
        </section>
    </main>

    <div id="previewModal" class="modal-overlay">
        <div class="modal-content">
            <div class="modal-header">
                <h2>Preview PDF Anda</h2>
                <p>Periksa kembali hasil editan Anda sebelum mengunduh.</p>
            </div>
            <div class="modal-body">
                <iframe id="pdfPreviewFrame" src=""></iframe>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn-secondary" onclick="closePreview()" style="background:#e2e8f0; color:#333; border:none;">⬅ Kembali Edit</button>
                <a href="#" id="btnDownloadFinal" class="btn-primary" download style="text-decoration: none; display: flex; align-items: center;">⬇ Unduh PDF</a>
            </div>
        </div>
    </div>

    <div id="loadingOverlay">
        <div class="spinner"></div>
        <p>Memproses PDF...</p>
    </div>

    <?php if ($error): ?>
        <script>alert("Gagal: <?= htmlspecialchars($error) ?>");</script>
    <?php endif; ?>

    <script src="vendor/pdfjs/build/pdf.min.js"></script>
    <script>pdfjsLib.GlobalWorkerOptions.workerSrc='vendor/pdfjs/build/pdf.worker.min.js';</script>
    <script src="vendor/fabricjs/fabric.min.js"></script>
    <script src="public/app.js"></script>
</body>
</html>