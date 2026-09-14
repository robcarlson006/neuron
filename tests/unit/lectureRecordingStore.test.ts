import { useLectureRecordingStore } from '../../src/store/lectureRecordingStore'

describe('useLectureRecordingStore', () => {
  beforeEach(() => {
    useLectureRecordingStore.setState({
      isRecording: false,
      isPaused: false,
      sessionId: null,
      lectureId: null,
      subjectId: null,
      subjectName: null,
      lectureTitle: '',
      elapsedSeconds: 0,
      selectedDeviceId: 'default',
      audioLevel: 0,
      error: null
    })
  })

  test('initial state is idle', () => {
    const state = useLectureRecordingStore.getState()
    expect(state.isRecording).toBe(false)
    expect(state.isPaused).toBe(false)
    expect(state.elapsedSeconds).toBe(0)
    expect(state.selectedDeviceId).toBe('default')
  })

  test('setSelectedDeviceId updates selected device', () => {
    useLectureRecordingStore.getState().setSelectedDeviceId('mic-teams-device-id')
    expect(useLectureRecordingStore.getState().selectedDeviceId).toBe('mic-teams-device-id')
  })

  test('handles pause and resume state', () => {
    useLectureRecordingStore.setState({ isRecording: true, isPaused: false })

    useLectureRecordingStore.getState().pauseRecording()
    expect(useLectureRecordingStore.getState().isPaused).toBe(true)

    useLectureRecordingStore.getState().resumeRecording()
    expect(useLectureRecordingStore.getState().isPaused).toBe(false)
  })

  test('resets recording state on cancel', async () => {
    useLectureRecordingStore.setState({
      isRecording: true,
      sessionId: 'test-session-123',
      lectureId: 42,
      subjectId: 1,
      subjectName: 'Biology',
      elapsedSeconds: 120
    })

    // Mock window.electronAPI.abortLectureRecording
    window.electronAPI = {
      ...window.electronAPI,
      abortLectureRecording: jest.fn().mockResolvedValue(true)
    } as any

    await useLectureRecordingStore.getState().cancelRecording()

    const state = useLectureRecordingStore.getState()
    expect(state.isRecording).toBe(false)
    expect(state.sessionId).toBeNull()
    expect(state.lectureId).toBeNull()
    expect(state.elapsedSeconds).toBe(0)
  })
})
