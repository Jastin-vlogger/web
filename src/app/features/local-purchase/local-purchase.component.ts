import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';
import { LocalPurchaseService } from './services/local-purchase.service';
import { LocalPurchase } from './models/local-purchase.model';

@Component({
  selector: 'app-local-purchase-list',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './local-purchase.component.html',
})
export class LocalPurchaseListComponent implements OnInit {
  items = signal<LocalPurchase[]>([]);
  loading = signal(true);
  currentPage = signal(1);
  pageSize = signal(20);
  totalRecords = signal(0);
  totalPages = signal(0);
  searchQuery = signal('');

  private readonly searchInput$ = new Subject<string>();

  constructor(private localPurchaseService: LocalPurchaseService, private router: Router) {}

  ngOnInit(): void {
    this.searchInput$.pipe(debounceTime(300), distinctUntilChanged()).subscribe((value) => {
      this.searchQuery.set(value.trim());
      this.currentPage.set(1);
      this.fetch();
    });
    this.fetch();
  }

  fetch(): void {
    this.loading.set(true);
    this.localPurchaseService.getList(this.currentPage(), this.pageSize(), this.searchQuery()).subscribe({
      next: (response) => {
        this.items.set(response.items);
        this.totalRecords.set(response.totalRecords);
        this.totalPages.set(response.totalPages);
        this.currentPage.set(response.page);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Error fetching local purchases:', err);
        this.loading.set(false);
      },
    });
  }

  onSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement)?.value ?? '';
    this.searchInput$.next(value);
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages()) return;
    this.currentPage.set(page);
    this.fetch();
  }

  track(item: LocalPurchase): void {
    this.router.navigate(['/local-purchase/track', item._id]);
  }

  supplierName(item: LocalPurchase): string {
    if (typeof item.supplierId === 'object' && item.supplierId?.name) return item.supplierId.name;
    return item.supplierName || '—';
  }

  stageClass(stage: string): string {
    switch (stage) {
      case 'Completed': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'Quality': return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'Storage & Arrival': return 'bg-blue-50 text-blue-700 border-blue-200';
      default: return 'bg-amber-50 text-amber-700 border-amber-200';
    }
  }
}
