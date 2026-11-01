import { addCertificationCredit, deleteCertification, getCertification, getCertificationCredits, getCertificationTypes, getUserCertifications, renewCertification, saveCertification } from '@resgrid/api';
import type { AddCertificationCreditInput, Certification, CertificationCredit, CertificationType, RenewCertificationInput, SaveCertificationInput } from '@resgrid/models';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { assertV4Success, unwrapItem, unwrapList } from '../core/envelope';
import { type DataError, toDataError } from '../core/errors';
import { dataPersistOptions, registerPersistedStore } from '../core/persist';
import { registerDataStoreReset } from '../core/reset';
import { getDataApiContext } from '../core/runtime';
import { createSliceRunner, emptySliceMeta, type FetchOptions, type SliceMeta, type SliceRunner } from '../core/slices';

type CertificationsSlice = 'types' | 'mine' | 'detail' | 'credits';

/** Member certifications (Responder `certifications` module). Writes are online only. */
interface CertificationsData extends SliceMeta<CertificationsSlice> {
  types: CertificationType[];
  certifications: Certification[];
  certificationsById: Record<number, Certification>;
  creditsByCertification: Record<number, CertificationCredit[]>;
  actionError: DataError | null;
}

export interface CertificationsState extends CertificationsData {
  fetchTypes: (options?: FetchOptions & { appliesTo?: number }) => Promise<void>;
  fetchCertifications: (userId?: string, options?: FetchOptions) => Promise<void>;
  fetchCertification: (id: number, options?: FetchOptions) => Promise<Certification | null>;
  fetchCredits: (certificationId: number, options?: FetchOptions) => Promise<void>;
  save: (input: SaveCertificationInput) => Promise<Certification | null>;
  renew: (input: RenewCertificationInput) => Promise<Certification | null>;
  remove: (id: number) => Promise<boolean>;
  addCredit: (input: AddCertificationCreditInput) => Promise<boolean>;
}

const initialData = (): CertificationsData => ({ ...emptySliceMeta<CertificationsSlice>(), types: [], certifications: [], certificationsById: {}, creditsByCertification: {}, actionError: null });

let runner: SliceRunner<CertificationsSlice, CertificationsState>;

export const useCertificationsStore = create<CertificationsState>()(
  persist(
    (set, get) => {
      runner = createSliceRunner<CertificationsSlice, CertificationsState>('certifications', set);
      const ctx = () => getDataApiContext();
      const act = async <T>(fn: () => Promise<T>): Promise<T | null> => {
        set({ actionError: null });
        try {
          return await fn();
        } catch (error) {
          set({ actionError: toDataError(error) });
          return null;
        }
      };
      const keep = (certification: Certification | null) => {
        if (certification)
          set((state) => ({
            certificationsById: { ...state.certificationsById, [certification.Id]: certification },
            certifications: [certification, ...state.certifications.filter((existing) => existing.Id !== certification.Id)],
          }));
        return certification;
      };
      return {
        ...initialData(),
        fetchTypes: async (options) => {
          await runner.run(
            'types',
            async () => unwrapList(await getCertificationTypes(ctx(), options?.appliesTo !== undefined ? { appliesTo: options.appliesTo } : {})),
            (types) => ({ types })
          );
        },
        fetchCertifications: async (userId) => {
          await runner.run(
            'mine',
            async () => unwrapList(await getUserCertifications(ctx(), userId ? { userId } : {})),
            (certifications) => ({ certifications }),
            { flightKey: `mine:${userId ?? ''}` }
          );
        },
        fetchCertification: async (id, options) => {
          const cached = get().certificationsById[id];
          if (cached && !options?.bypassCache) return cached;
          const result = await runner.run(
            'detail',
            async () => unwrapItem(await getCertification(ctx(), { id })),
            (certification, state) => (certification ? { certificationsById: { ...state.certificationsById, [id]: certification } } : {}),
            {
              flightKey: `detail:${id}`,
            }
          );
          return result.ok ? result.value : (cached ?? null);
        },
        fetchCredits: async (certificationId) => {
          await runner.run(
            'credits',
            async () => unwrapList(await getCertificationCredits(ctx(), { certificationId })),
            (list, state) => ({ creditsByCertification: { ...state.creditsByCertification, [certificationId]: list } }),
            {
              flightKey: `credits:${certificationId}`,
            }
          );
        },
        save: (input) => act(async () => keep(unwrapItem(assertV4Success(await saveCertification(ctx(), input))))),
        renew: (input) => act(async () => keep(unwrapItem(assertV4Success(await renewCertification(ctx(), input))))),
        remove: async (id) =>
          (await act(async () => {
            assertV4Success(await deleteCertification(ctx(), { id }));
            set((state) => ({ certifications: state.certifications.filter((certification) => certification.Id !== id) }));
            return true;
          })) === true,
        addCredit: async (input) =>
          (await act(async () => {
            const credits = unwrapList(assertV4Success(await addCertificationCredit(ctx(), input)));
            if (input.CertificationId) set((state) => ({ creditsByCertification: { ...state.creditsByCertification, [input.CertificationId as number]: credits } }));
            return true;
          })) === true,
      };
    },
    dataPersistOptions<CertificationsState, Pick<CertificationsData, 'types' | 'certifications' | 'fetchedAt'>>({
      name: 'omni-certifications-storage',
      partialize: (state) => ({ types: state.types, certifications: state.certifications, fetchedAt: state.fetchedAt }),
    })
  )
);

registerPersistedStore('omni-certifications-storage', useCertificationsStore);
registerDataStoreReset<CertificationsState>('certifications', useCertificationsStore, initialData, () => runner.invalidate());
