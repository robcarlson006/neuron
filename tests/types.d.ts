// Extend Window interface for tests
interface Window {
  electronAPI: {
    getUser: jest.Mock
    saveUser: jest.Mock
    getSubjects: jest.Mock
    saveSubject: jest.Mock
    deleteSubject: jest.Mock
    getCards: jest.Mock
    saveCard: jest.Mock
    deleteCard: jest.Mock
    saveManyCards: jest.Mock
    getSchedule: jest.Mock
    updateSchedule: jest.Mock
    getDueCards: jest.Mock
    getAllSchedules: jest.Mock
    processReview: jest.Mock
    saveReviewLog: jest.Mock
    getReviewLogs: jest.Mock
    getReviewLogsForCard: jest.Mock
    getDeadlines: jest.Mock
    saveDeadline: jest.Mock
    deleteDeadline: jest.Mock
    getDiagnostics: jest.Mock
    saveDiagnostics: jest.Mock
    getMaterials: jest.Mock
    saveMaterial: jest.Mock
    openFileDialog: jest.Mock
    parseFile: jest.Mock
    generateCards: jest.Mock
    evaluateAnswer: jest.Mock
    getApiKey: jest.Mock
    saveApiKey: jest.Mock
    checkApiKey: jest.Mock
    getMasteryStats: jest.Mock
    getStreakData: jest.Mock
    getWeakestCards: jest.Mock
    getMeta: jest.Mock
    setMeta: jest.Mock
  }
}
