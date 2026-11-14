<?php
namespace Src;

use setasign\Fpdi\Fpdi;

class PdfEditor
{
    public static function process(string $inputPdf, ?string $ttdImage, string $outputPdf, array $zones): void
    {
        $pdf = new Fpdi();
        $totalPages = $pdf->setSourceFile($inputPdf);

        $objectsByPage = [];
        if (isset($zones['objects'])) {
            foreach ($zones['objects'] as $obj) {
                $objectsByPage[$obj['page']][] = $obj;
            }
        }

        for ($i = 1; $i <= $totalPages; $i++) {
            $tpl = $pdf->importPage($i);
            $size = $pdf->getTemplateSize($tpl);
            $pdf->AddPage($size['orientation'], [$size['width'], $size['height']]);
            $pdf->useTemplate($tpl);

            if (isset($objectsByPage[$i])) {
                foreach ($objectsByPage[$i] as $obj) {
                    
                    // 1. Kotak Putih
                    if ($obj['type'] === 'rect') {
                        $pdf->SetFillColor(255, 255, 255);
                        $pdf->Rect($obj['x'], $obj['y'], $obj['w'], $obj['h'], 'F');
                    }

                    // 2. Gambar (TTD atau Teks yang sudah di-render)
                    elseif ($obj['type'] === 'image') {
                        // Jika ini gambar TTD (dari upload)
                        if ($obj['content'] === 'TTD_IMAGE' && $ttdImage) {
                            $pdf->Image($ttdImage, $obj['x'], $obj['y'], $obj['w'], $obj['h']);
                        } 
                        // Jika ini gambar Teks (Base64 yang sudah disimpan jadi file)
                        elseif ($obj['content'] !== 'TTD_IMAGE' && file_exists($obj['content'])) {
                            $pdf->Image($obj['content'], $obj['x'], $obj['y'], $obj['w'], $obj['h']);
                        }
                    }
                }
            }
        }
        
        $pdf->Output('F', $outputPdf);
    }
}