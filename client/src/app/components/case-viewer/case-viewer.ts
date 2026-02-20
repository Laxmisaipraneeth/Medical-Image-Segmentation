import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { CaseService, MedCase } from '../../services/case';

@Component({
  selector: 'app-case-viewer',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './case-viewer.html',
  styleUrl: './case-viewer.scss',
})
export class CaseViewerComponent implements OnInit {
  caseData: MedCase | null = null;
  loading = true;
  error = '';
  selectedImageIndex = 0;
  maskOpacity = 0.5;
  showMask = true;

  private apiBase = 'http://localhost:5002';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private caseService: CaseService
  ) {}

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.loadCase(id);
    }
  }

  loadCase(id: string) {
    this.caseService.getCase(id).subscribe({
      next: (res: any) => {
        this.caseData = res.case;
        this.loading = false;
      },
      error: () => {
        this.error = 'Failed to load case';
        this.loading = false;
      },
    });
  }

  getImageUrl(path: string): string {
    // Convert absolute path to URL served by Express static
    // path like: /Users/.../uploads/raw/caseId/file.png -> /uploads/raw/caseId/file.png
    const uploadsIdx = path.indexOf('/uploads/');
    if (uploadsIdx !== -1) {
      return this.apiBase + path.substring(uploadsIdx);
    }
    return this.apiBase + '/uploads/' + path;
  }

  get currentOriginal(): string {
    if (!this.caseData?.originalImages?.length) return '';
    return this.getImageUrl(this.caseData.originalImages[this.selectedImageIndex]);
  }

  get currentMask(): string {
    if (!this.caseData?.segmentedImages?.length) return '';
    return this.getImageUrl(this.caseData.segmentedImages[this.selectedImageIndex]);
  }

  get hasMask(): boolean {
    return !!(this.caseData?.segmentedImages && this.caseData.segmentedImages.length > this.selectedImageIndex);
  }

  selectImage(index: number) {
    this.selectedImageIndex = index;
  }

  toggleMask() {
    this.showMask = !this.showMask;
  }

  deleteCase() {
    if (!this.caseData) return;
    if (confirm('Delete this case permanently?')) {
      this.caseService.deleteCase(this.caseData._id).subscribe({
        next: () => {
          this.router.navigate(['/history']);
        },
        error: () => {
          this.error = 'Failed to delete case';
        },
      });
    }
  }
}
