Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = 'Stop'
$scriptRoot = if ($PSScriptRoot) { $PSScriptRoot } else { Join-Path (Get-Location) 'scripts' }
$root = Split-Path -Parent $scriptRoot
$assets = Join-Path $root 'assets'

function New-RoundedRectanglePath {
  param(
    [float] $X,
    [float] $Y,
    [float] $Width,
    [float] $Height,
    [float] $Radius
  )

  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $diameter = $Radius * 2
  $path.AddArc($X, $Y, $diameter, $diameter, 180, 90)
  $path.AddArc($X + $Width - $diameter, $Y, $diameter, $diameter, 270, 90)
  $path.AddArc($X + $Width - $diameter, $Y + $Height - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($X, $Y + $Height - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

function New-IconFont {
  param(
    [string[]] $Families,
    [float] $Size,
    [System.Drawing.FontStyle] $Style = [System.Drawing.FontStyle]::Regular
  )

  foreach ($family in $Families) {
    try {
      return [System.Drawing.Font]::new($family, $Size, $Style, [System.Drawing.GraphicsUnit]::Pixel)
    } catch {
    }
  }

  return [System.Drawing.Font]::new([System.Drawing.FontFamily]::GenericSansSerif, $Size, $Style, [System.Drawing.GraphicsUnit]::Pixel)
}

function Draw-CenteredText {
  param(
    [System.Drawing.Graphics] $Graphics,
    [string] $Text,
    [System.Drawing.Font] $Font,
    [System.Drawing.Brush] $Brush,
    [System.Drawing.RectangleF] $Bounds
  )

  $format = [System.Drawing.StringFormat]::new()
  $format.Alignment = [System.Drawing.StringAlignment]::Center
  $format.LineAlignment = [System.Drawing.StringAlignment]::Center
  $Graphics.DrawString($Text, $Font, $Brush, $Bounds, $format)
  $format.Dispose()
}

function New-AppIcon {
  param(
    [string] $Path,
    [int] $Size
  )

  $bitmap = [System.Drawing.Bitmap]::new($Size, $Size)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $graphics.ScaleTransform($Size / 1024, $Size / 1024)

  $backgroundRect = [System.Drawing.RectangleF]::new(0, 0, 1024, 1024)
  $background = [System.Drawing.Drawing2D.LinearGradientBrush]::new($backgroundRect, [System.Drawing.Color]::FromArgb(8, 58, 44), [System.Drawing.Color]::FromArgb(9, 47, 39), 45)
  $graphics.FillRectangle($background, $backgroundRect)

  $accentBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(220, 215, 179, 93))
  foreach ($dot in @(@(224, 208, 22), @(800, 212, 22), @(210, 820, 18), @(814, 816, 18))) {
    $graphics.FillEllipse($accentBrush, $dot[0] - $dot[2], $dot[1] - $dot[2], $dot[2] * 2, $dot[2] * 2)
  }

  $state = $graphics.Save()
  $graphics.TranslateTransform(512, 512)
  $graphics.RotateTransform(-4)
  $graphics.TranslateTransform(-512, -512)

  foreach ($shadow in @(@(272, 172, 528, 708, 70), @(260, 158, 528, 708, 38))) {
    $shadowPath = New-RoundedRectanglePath $shadow[0] $shadow[1] $shadow[2] $shadow[3] 82
    $shadowBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb($shadow[4], 3, 23, 17))
    $graphics.FillPath($shadowBrush, $shadowPath)
    $shadowBrush.Dispose()
    $shadowPath.Dispose()
  }

  $tilePath = New-RoundedRectanglePath 248 138 528 708 82
  $tileRect = [System.Drawing.RectangleF]::new(248, 138, 528, 708)
  $tileBrush = [System.Drawing.Drawing2D.LinearGradientBrush]::new($tileRect, [System.Drawing.Color]::FromArgb(255, 249, 236), [System.Drawing.Color]::FromArgb(220, 196, 159), 45)
  $graphics.FillPath($tileBrush, $tilePath)

  $borderPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(255, 243, 216), 12)
  $graphics.DrawPath($borderPen, $tilePath)

  $innerPath = New-RoundedRectanglePath 292 184 440 616 48
  $innerPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(196, 208, 173, 103), 8)
  $graphics.DrawPath($innerPen, $innerPath)

  $titleFont = New-IconFont @('Microsoft JhengHei UI', 'Microsoft YaHei UI', 'Arial Unicode MS') 292 ([System.Drawing.FontStyle]::Bold)
  $wordFont = New-IconFont @('Microsoft JhengHei UI', 'Microsoft YaHei UI', 'Arial Unicode MS') 104 ([System.Drawing.FontStyle]::Bold)
  $redBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(181, 32, 36))
  $greenBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(11, 75, 56))
  $zhong = [string][char]0x4E2D
  $appName = ([string][char]0x96C0) + ([string][char]0x6578)
  Draw-CenteredText $graphics $zhong $titleFont $redBrush ([System.Drawing.RectangleF]::new(276, 220, 472, 330))
  Draw-CenteredText $graphics $appName $wordFont $greenBrush ([System.Drawing.RectangleF]::new(286, 560, 452, 138))

  foreach ($x in @(434, 512, 590)) {
    $graphics.FillEllipse($accentBrush, $x - 22, 694, 44, 44)
  }

  $graphics.Restore($state)

  foreach ($item in @($background, $accentBrush, $tileBrush, $borderPen, $innerPen, $innerPath, $tilePath, $titleFont, $wordFont, $redBrush, $greenBrush)) {
    $item.Dispose()
  }
  $graphics.Dispose()
  $bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bitmap.Dispose()
}

New-AppIcon (Join-Path $assets 'icon.png') 1024
New-AppIcon (Join-Path $assets 'favicon.png') 48
Write-Host 'Generated assets/icon.png and assets/favicon.png'