import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface PatientDetails {
  patientName: string;
  patientId: string;
  age: number;
  gender: string;
  modality: string;
  bodyPart: string;
  clinicalNotes: string;
  studyDate: string;
}

export interface MedCase {
  _id: string;
  radiologistId: string;
  patientDetails: PatientDetails;
  originalImages: string[];
  supportImages: string[];
  supportLabels: string[];
  segmentedImages: string[];
  status: string;
  errorMessage: string;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class CaseService {
  private apiUrl = 'http://localhost:5002/api/cases';

  constructor(private http: HttpClient) {}

  createCase(patientDetails: PatientDetails): Observable<any> {
    return this.http.post(this.apiUrl, { patientDetails });
  }

  uploadFiles(caseId: string, images: File[], supportImages: File[], supportLabels: File[]): Observable<any> {
    const formData = new FormData();
    images.forEach(f => formData.append('images', f));
    supportImages.forEach(f => formData.append('supportImages', f));
    supportLabels.forEach(f => formData.append('supportLabels', f));
    return this.http.post(`${this.apiUrl}/${caseId}/upload`, formData);
  }

  runSegmentation(caseId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/${caseId}/segment`, {});
  }

  getCases(): Observable<any> {
    return this.http.get(this.apiUrl);
  }

  getCase(caseId: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/${caseId}`);
  }

  deleteCase(caseId: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${caseId}`);
  }
}
