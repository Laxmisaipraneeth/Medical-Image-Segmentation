import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [RouterLink, CommonModule],
  templateUrl: './landing.html',
  styleUrl: './landing.scss',
})
export class LandingComponent {
  features = [
    {
      icon: 'neurology',
      title: 'AI-Powered Segmentation',
      description: 'Leverages UniverSeg, a universal medical image segmentation model that works across any anatomy or modality — no retraining needed.'
    },
    {
      icon: 'upload_file',
      title: 'Instant Upload & Process',
      description: 'Simply drag and drop your medical images. Our pipeline handles preprocessing, inference, and mask generation automatically.'
    },
    {
      icon: 'visibility',
      title: 'Interactive Mask Viewer',
      description: 'Overlay segmentation masks on originals with adjustable opacity. Compare, toggle, and inspect results with precision.'
    },
    {
      icon: 'folder_managed',
      title: 'Case Management',
      description: 'Organize patient cases with full metadata — track history, manage records, and revisit segmented results anytime.'
    },
    {
      icon: 'shield',
      title: 'Secure & Private',
      description: 'JWT-authenticated sessions, encrypted data in transit, and local processing ensure patient data stays protected.'
    },
    {
      icon: 'speed',
      title: 'Real-Time Results',
      description: 'Get segmentation results in seconds, not hours. Built for the speed that clinical workflows demand.'
    }
  ];

  stats = [
    { value: '< 30s', label: 'Average Processing' },
    { value: '10+', label: 'Modalities Supported' },
    { value: '99.9%', label: 'Uptime' },
  ];
}
