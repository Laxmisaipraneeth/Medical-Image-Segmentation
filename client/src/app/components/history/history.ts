import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { CaseService, MedCase } from '../../services/case';

@Component({
  selector: 'app-history',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './history.html',
  styleUrl: './history.scss',
})
export class HistoryComponent implements OnInit {
  cases: MedCase[] = [];
  loading = true;

  constructor(private caseService: CaseService) {}

  ngOnInit() {
    this.caseService.getCases().subscribe({
      next: (res: any) => {
        this.cases = res.cases;
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      },
    });
  }

  deleteCase(id: string, event: Event) {
    event.preventDefault();
    event.stopPropagation();
    if (confirm('Delete this case?')) {
      this.caseService.deleteCase(id).subscribe({
        next: () => {
          this.cases = this.cases.filter(c => c._id !== id);
        },
      });
    }
  }
}
