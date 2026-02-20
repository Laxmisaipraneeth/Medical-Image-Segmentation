import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CaseService, PatientDetails } from '../../services/case';

@Component({
  selector: 'app-new-case',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './new-case.html',
  styleUrl: './new-case.scss',
})
export class NewCaseComponent {
  step = 1; // 1: patient details, 2: upload, 3: processing
  error = '';
  success = '';
  loading = false;
  caseId = '';

  patient: PatientDetails = {
    patientName: '',
    patientId: '',
    age: 0,
    gender: '',
    modality: '',
    bodyPart: '',
    clinicalNotes: '',
    studyDate: '',
  };

  imageFiles: File[] = [];
  supportImageFiles: File[] = [];
  supportLabelFiles: File[] = [];

  constructor(private caseService: CaseService, private router: Router) {}

  onCreateCase() {
    this.loading = true;
    this.error = '';
    this.caseService.createCase(this.patient).subscribe({
      next: (res: any) => {
        this.caseId = res.case._id;
        this.step = 2;
        this.loading = false;
      },
      error: (err) => {
        this.error = err.error?.error || 'Failed to create case';
        this.loading = false;
      },
    });
  }

  onImageSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files) {
      this.imageFiles = Array.from(input.files);
    }
  }

  onSupportImageSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files) {
      this.supportImageFiles = Array.from(input.files);
    }
  }

  onSupportLabelSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files) {
      this.supportLabelFiles = Array.from(input.files);
    }
  }

  onUploadAndSegment() {
    if (this.imageFiles.length === 0) {
      this.error = 'Please select at least one image.';
      return;
    }

    this.loading = true;
    this.error = '';
    this.step = 3;

    // Step 1: Upload files
    this.caseService.uploadFiles(this.caseId, this.imageFiles, this.supportImageFiles, this.supportLabelFiles).subscribe({
      next: () => {
        // Step 2: Run segmentation
        this.caseService.runSegmentation(this.caseId).subscribe({
          next: () => {
            this.success = 'Segmentation complete!';
            this.loading = false;
            setTimeout(() => {
              this.router.navigate(['/case', this.caseId]);
            }, 1000);
          },
          error: (err) => {
            this.error = err.error?.error || 'Segmentation failed';
            this.loading = false;
          },
        });
      },
      error: (err) => {
        this.error = err.error?.error || 'Upload failed';
        this.loading = false;
        this.step = 2;
      },
    });
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
  }

  onDrop(event: DragEvent, type: string) {
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer?.files) {
      const files = Array.from(event.dataTransfer.files);
      if (type === 'images') {
        this.imageFiles = files;
      } else if (type === 'supportImages') {
        this.supportImageFiles = files;
      } else if (type === 'supportLabels') {
        this.supportLabelFiles = files;
      }
    }
  }
}
