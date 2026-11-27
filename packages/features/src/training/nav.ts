import { GraduationCap } from 'lucide-react-native';

import type { FeatureNavEntry } from '../certifications/nav';
import { trainingRoutes } from './routes';

/** "Training" (Responder): the member's trainings, courses, transcript and CE/CPD submissions; the other screens open from it. */
export const trainingNav: readonly FeatureNavEntry[] = [{ id: 'training', href: trainingRoutes.home(), labelKey: 'training.title', defaultLabel: 'Training', icon: GraduationCap, requiresModule: 'training' }];
