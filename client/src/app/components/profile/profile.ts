import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService} from '../../services/auth';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './profile.html',
  styleUrl: './profile.scss',
})
export class ProfileComponent implements OnInit {
  form = {
    name: '',
    hospital: '',
    specialization: '',
  };
  email = '';
  success = '';
  error = '';
  loading = false;

  constructor(private auth: AuthService) {}

  ngOnInit() {
    const user = this.auth.currentUser;
    if (user) {
      this.form.name = user.name;
      this.form.hospital = user.hospital;
      this.form.specialization = user.specialization;
      this.email = user.email;
    }
  }

  onSave() {
    this.loading = true;
    this.error = '';
    this.success = '';
    this.auth.updateProfile(this.form).subscribe({
      next: () => {
        this.success = 'Profile updated successfully.';
        this.loading = false;
      },
      error: (err) => {
        this.error = err.error?.error || 'Update failed';
        this.loading = false;
      },
    });
  }
}
