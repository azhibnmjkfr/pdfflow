<?php
spl_autoload_register(function ($class) {
    $base = __DIR__ . '/..';

    // Kelas buatan kita: Src\Foo -> src/Foo.php
    if (str_starts_with($class, 'Src\\')) {
        $file = $base . '/src/' . str_replace('\\', '/', substr($class, 4)) . '.php';
        if (is_file($file)) { require $file; return; }
    }

    // FPDF
    if ($class === 'FPDF') {
        require __DIR__ . '/setasign/fpdf/fpdf.php';
        return;
    }

    // FPDI: setasign\Fpdi\Fpdi -> vendor/setasign/fpdi/Fpdi.php
    if (str_starts_with($class, 'setasign\\Fpdi\\')) {
        $rel = substr($class, strlen('setasign\\Fpdi\\'));
        $file = __DIR__ . '/setasign/fpdi/' . str_replace('\\', '/', $rel) . '.php';
        if (is_file($file)) { require $file; return; }
    }
});