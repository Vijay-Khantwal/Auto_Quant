import { useState, useCallback, useRef, useEffect } from 'react';

export default function useDebatePlayer(turns = [], onFinished) {
  const [currentTurnIndex, setCurrentTurnIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [convictionValue, setConvictionValue] = useState(0);
  const timerRef = useRef(null);
  const turnsRef = useRef(turns);
  const onFinishedRef = useRef(onFinished);

  useEffect(() => {
    turnsRef.current = turns;
  }, [turns]);

  useEffect(() => {
    onFinishedRef.current = onFinished;
  }, [onFinished]);

  // Auto-play when turns change (new debate loaded)
  useEffect(() => {
    if (turns.length > 0 && currentTurnIndex === -1) {
      const durations = calcDurations(turns);
      setConvictionValue(0);
      setIsPlaying(true);
      setIsPaused(false);
      const timer = setTimeout(() => advanceTurnFn(0, durations), 200);
      return () => clearTimeout(timer);
    }
  }, [turns]);

  function calcDurations(t) {
    if (!t.length) return [];
    const totalChars = t.reduce((sum, x) => sum + (x.text || '').length, 0);
    if (totalChars === 0) return t.map(() => 2000);
    const TARGET = 15000, MIN = 12000, MAX = 18000;
    let raw = t.map(x => ((x.text || '').length / totalChars) * TARGET);
    raw = raw.map(d => Math.max(d, 800));
    const rawTotal = raw.reduce((a, b) => a + b, 0);
    const clamped = Math.max(MIN, Math.min(MAX, rawTotal));
    const scale = clamped / rawTotal;
    return raw.map(d => d * scale);
  }

  const clearTimer = () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  };

  function advanceTurnFn(index, durations) {
    const allTurns = turnsRef.current;
    if (index >= allTurns.length) {
      setIsPlaying(false);
      if (onFinishedRef.current) onFinishedRef.current();
      return;
    }
    setCurrentTurnIndex(index);
    setConvictionValue(prev => prev + (allTurns[index].conviction_delta || 0));

    if (index < allTurns.length - 1) {
      timerRef.current = setTimeout(() => advanceTurnFn(index + 1, durations), durations[index]);
    } else {
      timerRef.current = setTimeout(() => {
        setIsPlaying(false);
        if (onFinishedRef.current) onFinishedRef.current();
      }, durations[index]);
    }
  }

  const play = useCallback(() => {
    if (!turnsRef.current.length) return;
    clearTimer();
    const durations = calcDurations(turnsRef.current);
    if (isPaused && currentTurnIndex >= 0) {
      setIsPaused(false);
      setIsPlaying(true);
      advanceTurnFn(currentTurnIndex + 1, durations);
    } else {
      setConvictionValue(0);
      setCurrentTurnIndex(-1);
      setIsPaused(false);
      setIsPlaying(true);
      setTimeout(() => advanceTurnFn(0, durations), 100);
    }
  }, [isPaused, currentTurnIndex]);

  const pause = useCallback(() => {
    clearTimer();
    setIsPaused(true);
    setIsPlaying(false);
  }, []);

  const skipToEnd = useCallback(() => {
    clearTimer();
    const t = turnsRef.current;
    if (!t.length) return;
    let total = 0;
    t.forEach(x => { total += (x.conviction_delta || 0); });
    setCurrentTurnIndex(t.length - 1);
    setConvictionValue(total);
    setIsPlaying(false);
    setIsPaused(false);
    if (onFinishedRef.current) onFinishedRef.current();
  }, []);

  const replay = useCallback(() => {
    clearTimer();
    setConvictionValue(0);
    setCurrentTurnIndex(-1);
    setIsPaused(false);
    setIsPlaying(false);
    setTimeout(() => {
      const durations = calcDurations(turnsRef.current);
      setIsPlaying(true);
      advanceTurnFn(0, durations);
    }, 100);
  }, []);

  const progress = turnsRef.current.length > 0
    ? ((currentTurnIndex + 1) / turnsRef.current.length) * 100
    : 0;

  useEffect(() => { return () => clearTimer(); }, []);

  return { currentTurnIndex, isPlaying, isPaused, convictionValue, play, pause, skipToEnd, replay, progress };
}
