import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer } from '@angular/platform-browser';

/**
 * In-page document preview modal (PDF via iframe, images with zoom). Extracted from the
 * shipment-summary step so every feature opens documents the same way instead of a new tab.
 * Usage: `<app-document-preview #docPreview />` then `docPreview.open(url, name)`.
 */
@Component({
  selector: 'app-document-preview',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './document-preview.component.html',
})
export class DocumentPreviewComponent {
  private sanitizer = inject(DomSanitizer);

  readonly isOpen = signal(false);
  readonly url = signal<string | null>(null);
  readonly title = signal('');
  readonly isImage = signal(false);
  readonly zoom = signal(1);
  readonly transformOrigin = signal('center center');

  readonly safeUrl = computed(() => {
    const url = this.url();
    if (!url || this.isImage()) return null;
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  });

  open(url: string, title = 'Document'): void {
    if (!url) return;
    this.url.set(url);
    this.title.set(title);
    this.isImage.set(this.isImageUrl(url));
    this.resetZoom();
    this.isOpen.set(true);
  }

  close(): void {
    this.isOpen.set(false);
    this.url.set(null);
    this.title.set('');
    this.isImage.set(false);
    this.resetZoom();
  }

  zoomIn(): void {
    this.zoom.update((z) => Math.min(z + 0.25, 4));
  }

  zoomOut(): void {
    this.zoom.update((z) => Math.max(z - 0.25, 1));
  }

  resetZoom(): void {
    this.zoom.set(1);
    this.transformOrigin.set('center center');
  }

  onImageDoubleClick(event: MouseEvent): void {
    const target = event.target as HTMLImageElement;
    const rect = target.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    this.transformOrigin.set(`${x}% ${y}%`);
    this.zoom.update((z) => (z > 1 ? 1 : 2));
  }

  private isImageUrl(url: string): boolean {
    const clean = url.split('?')[0].toLowerCase();
    return /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/.test(clean);
  }
}
