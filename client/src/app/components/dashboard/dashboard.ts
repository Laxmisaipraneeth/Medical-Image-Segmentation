import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { CaseService, MedCase } from '../../services/case';
import { AuthService } from '../../services/auth';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class DashboardComponent implements OnInit {
  cases: MedCase[] = [];
  recentCases: MedCase[] = [];
  loading = true;

  constructor(
    public auth: AuthService,
    private caseService: CaseService
  ) {}

  ngOnInit() {
    this.loadCases();
  }

  loadCases() {
    this.caseService.getCases().subscribe({
      next: (res: any) => {
        this.cases = res.cases;
        this.recentCases = this.cases.slice(0, 5);
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      },
    });
  }

  get totalCases() { return this.cases.length; }
  get completedCases() { return this.cases.filter(c => c.status === 'completed').length; }
  get processingCases() { return this.cases.filter(c => c.status === 'processing').length; }
}
