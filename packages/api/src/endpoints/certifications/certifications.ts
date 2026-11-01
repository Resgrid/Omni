import type { AddCertificationCreditInput, Certification, CertificationCredit, CertificationsResult, CertificationType, RenewCertificationInput, SaveCertificationInput } from '@resgrid/models';

import { type ApiContext, defineEndpoints, request, type RequestOptions } from '../../core';

/** Core v4 endpoints for certifications (Certifications). The contract test checks every entry against Swagger. */
export const certificationsEndpoints = defineEndpoints('certifications', {
  addCertificationCredit: { method: 'POST', path: '/Certifications/AddCertificationCredit', body: 'json' },
  deleteCertification: { method: 'DELETE', path: '/Certifications/DeleteCertification', query: ['id'] },
  getCertification: { method: 'GET', path: '/Certifications/GetCertification', query: ['id'] },
  getCertificationCredits: { method: 'GET', path: '/Certifications/GetCertificationCredits', query: ['certificationId'] },
  getCertificationTypes: { method: 'GET', path: '/Certifications/GetCertificationTypes', query: ['appliesTo', 'includeInactive'] },
  getUserCertifications: { method: 'GET', path: '/Certifications/GetUserCertifications', query: ['userId'] },
  renewCertification: { method: 'POST', path: '/Certifications/RenewCertification', body: 'json' },
  saveCertification: { method: 'POST', path: '/Certifications/SaveCertification', body: 'json' },
});

const E = certificationsEndpoints;

/** `POST /Certifications/AddCertificationCredit` — legacy: R. */
export const addCertificationCredit = (ctx: ApiContext, body: AddCertificationCreditInput, options?: RequestOptions): Promise<CertificationsResult<CertificationCredit[]>> =>
  request<CertificationsResult<CertificationCredit[]>>(ctx, E.addCertificationCredit, { body }, options);

/** `DELETE /Certifications/DeleteCertification` — legacy: R. */
export const deleteCertification = (ctx: ApiContext, params: { id: number | string }, options?: RequestOptions): Promise<CertificationsResult<unknown>> =>
  request<CertificationsResult<unknown>>(ctx, E.deleteCertification, { params }, options);

/** `GET /Certifications/GetCertification` — legacy: R. */
export const getCertification = (ctx: ApiContext, params: { id: number | string }, options?: RequestOptions): Promise<CertificationsResult<Certification>> =>
  request<CertificationsResult<Certification>>(ctx, E.getCertification, { params }, options);

/** `GET /Certifications/GetCertificationCredits` — legacy: R. */
export const getCertificationCredits = (ctx: ApiContext, params: { certificationId: number | string }, options?: RequestOptions): Promise<CertificationsResult<CertificationCredit[]>> =>
  request<CertificationsResult<CertificationCredit[]>>(ctx, E.getCertificationCredits, { params }, options);

/** `GET /Certifications/GetCertificationTypes` — legacy: R. */
export const getCertificationTypes = (ctx: ApiContext, params: { appliesTo?: number | string; includeInactive?: boolean } = {}, options?: RequestOptions): Promise<CertificationsResult<CertificationType[]>> =>
  request<CertificationsResult<CertificationType[]>>(ctx, E.getCertificationTypes, { params }, options);

/** The caller's records, or another member's with Certifications_View. `GET /Certifications/GetUserCertifications` — legacy: R. */
export const getUserCertifications = (ctx: ApiContext, params: { userId?: string } = {}, options?: RequestOptions): Promise<CertificationsResult<Certification[]>> =>
  request<CertificationsResult<Certification[]>>(ctx, E.getUserCertifications, { params }, options);

/** `POST /Certifications/RenewCertification` — legacy: R. */
export const renewCertification = (ctx: ApiContext, body: RenewCertificationInput, options?: RequestOptions): Promise<CertificationsResult<Certification>> =>
  request<CertificationsResult<Certification>>(ctx, E.renewCertification, { body }, options);

/** `POST /Certifications/SaveCertification` — legacy: R. */
export const saveCertification = (ctx: ApiContext, body: SaveCertificationInput, options?: RequestOptions): Promise<CertificationsResult<Certification>> =>
  request<CertificationsResult<Certification>>(ctx, E.saveCertification, { body }, options);
