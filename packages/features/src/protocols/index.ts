// Protocols feature (omni-plan §7.10; protocols plan P1–P3): the library with version stamps, read-and-sign with quizzes, and
// step-through on calls. Re-exported through one statement (the export sorter would drop blank lines between export-froms).
import { AcknowledgmentList, owedAcknowledgments } from './components/acknowledgment-list';
import { AcknowledgmentPanel, type AcknowledgmentPanelProps, bankQuizQuestions, trainingQuizQuestions } from './components/acknowledgment-panel';
import { CallProtocolSteps, type CallProtocolStepsProps, nextStepState } from './components/call-protocol-steps';
import { type DownloadableFile, FileList, type FileListProps } from './components/file-list';
import { ProtocolCard, type ProtocolCardProps } from './components/protocol-card';
import { ProtocolContent, type ProtocolContentProps } from './components/protocol-content';
import { isQuizComplete, QuizForm, type QuizFormProps, type QuizQuestionView, type QuizSubmission, toggleQuizKey } from './components/quiz-form';
import { acknowledgeOutcomeKey, acknowledgmentStatusKey, filterLibrary, groupSteps, isDocumentVersion, kindsInLibrary, protocolDisplayHtml, protocolKindKey, stepStateKey } from './lib/protocol-library';
import { protocolsNav } from './nav';
import { PROTOCOL_STEPS_CALL_DETAIL_TAB_ID, registerProtocolStepsCallDetailTab } from './register';
import { protocolDetail, protocolList, protocolRoutes } from './routes';
import { default as ProtocolDetailScreen, type ProtocolDetailScreenProps } from './screens/protocol-detail';
import { default as ProtocolListScreen, searchProtocols } from './screens/protocol-list';

export {
  acknowledgeOutcomeKey,
  AcknowledgmentList,
  AcknowledgmentPanel,
  type AcknowledgmentPanelProps,
  acknowledgmentStatusKey,
  bankQuizQuestions,
  CallProtocolSteps,
  type CallProtocolStepsProps,
  type DownloadableFile,
  FileList,
  type FileListProps,
  filterLibrary,
  groupSteps,
  isDocumentVersion,
  isQuizComplete,
  kindsInLibrary,
  nextStepState,
  owedAcknowledgments,
  PROTOCOL_STEPS_CALL_DETAIL_TAB_ID,
  ProtocolCard,
  type ProtocolCardProps,
  ProtocolContent,
  type ProtocolContentProps,
  protocolDetail,
  ProtocolDetailScreen,
  type ProtocolDetailScreenProps,
  protocolDisplayHtml,
  protocolKindKey,
  protocolList,
  ProtocolListScreen,
  protocolRoutes,
  protocolsNav,
  QuizForm,
  type QuizFormProps,
  type QuizQuestionView,
  type QuizSubmission,
  registerProtocolStepsCallDetailTab,
  searchProtocols,
  stepStateKey,
  toggleQuizKey,
  trainingQuizQuestions,
};
