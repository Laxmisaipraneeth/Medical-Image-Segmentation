import { Routes } from '@angular/router';
import { authGuard } from './guards/auth-guard';
import { LandingComponent } from './components/landing/landing';
import { LoginComponent } from './components/login/login';
import { RegisterComponent } from './components/register/register';
import { DashboardComponent } from './components/dashboard/dashboard';
import { NewCaseComponent } from './components/new-case/new-case';
import { CaseViewerComponent } from './components/case-viewer/case-viewer';
import { HistoryComponent } from './components/history/history';
import { ProfileComponent } from './components/profile/profile';

export const routes: Routes = [
  { path: '', component: LandingComponent },
  { path: 'login', component: LoginComponent },
  { path: 'register', component: RegisterComponent },
  { path: 'dashboard', component: DashboardComponent, canActivate: [authGuard] },
  { path: 'new-case', component: NewCaseComponent, canActivate: [authGuard] },
  { path: 'case/:id', component: CaseViewerComponent, canActivate: [authGuard] },
  { path: 'history', component: HistoryComponent, canActivate: [authGuard] },
  { path: 'profile', component: ProfileComponent, canActivate: [authGuard] },
  { path: '**', redirectTo: '' },
];
