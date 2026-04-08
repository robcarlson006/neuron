/**
 * Seeds the database with World History study cards for demo purposes
 * Only runs once on first launch
 */

const historyFlashcards = [
  { front: '1066', back: 'Norman Conquest of England; William the Conqueror defeats Harold at the Battle of Hastings' },
  { front: '1215', back: 'Magna Carta signed by King John of England; limited royal power and established rule of law' },
  { front: '1347–1351', back: 'The Black Death; bubonic plague killed approximately one-third of Europe\'s population' },
  { front: '1453', back: 'Fall of Constantinople to the Ottoman Empire under Sultan Mehmed II; end of the Byzantine Empire' },
  { front: '1492', back: 'Columbus reaches the Americas; beginning of the Age of Exploration and European colonization' },
  { front: '1517', back: 'Martin Luther posts his 95 Theses; start of the Protestant Reformation' },
  { front: '1588', back: 'Defeat of the Spanish Armada by England; shift of naval power toward England' },
  { front: '1618–1648', back: 'Thirty Years\' War; devastated Central Europe, ended by Peace of Westphalia establishing national sovereignty' },
  { front: '1687', back: 'Newton publishes Principia Mathematica; foundational work of the Scientific Revolution' },
  { front: '1776', back: 'Declaration of Independence signed; thirteen American colonies declare independence from Britain' },
  { front: '1789', back: 'French Revolution begins; storming of the Bastille, Declaration of the Rights of Man' },
  { front: '1799', back: 'Napoleon Bonaparte seizes power in France via coup d\'état; begins Napoleonic era' },
  { front: '1815', back: 'Battle of Waterloo; Napoleon\'s final defeat; Concert of Europe established at Congress of Vienna' },
  { front: '1848', back: 'Year of Revolutions; nationalist and liberal uprisings across Europe; Communist Manifesto published' },
  { front: '1861–1865', back: 'American Civil War; ended slavery in the United States; preserved the Union' },
  { front: '1869', back: 'Suez Canal opens; transformed global trade routes between Europe and Asia' },
  { front: '1871', back: 'Unification of Germany; Bismarck creates German Empire; major shift in European balance of power' },
  { front: '1914–1918', back: 'World War I; causes: nationalism, imperialism, militarism, entangling alliances, assassination of Archduke Franz Ferdinand' },
  { front: '1917', back: 'Russian Revolution; Bolsheviks under Lenin overthrow the Provisional Government; USSR eventually established' },
  { front: '1929', back: 'Great Depression begins; stock market crash; global economic collapse lasting through the 1930s' },
  { front: '1939–1945', back: 'World War II; deadliest conflict in history; led to UN formation, Cold War, and decolonization' },
  { front: '1945', back: 'Atomic bombs dropped on Hiroshima and Nagasaki; Japan surrenders; end of WWII' },
  { front: '1947', back: 'Indian independence and partition; Cold War begins with Truman Doctrine and Marshall Plan' },
  { front: '1948', back: 'State of Israel declared; Universal Declaration of Human Rights adopted by UN' },
  { front: '1989', back: 'Fall of the Berlin Wall; collapse of Soviet satellite states; beginning of the end of the Cold War' },
  { front: 'Causes of WWI', back: 'MAIN: Militarism (arms race), Alliance system (Triple Entente vs Triple Alliance), Imperialism (colonial rivalries), Nationalism (especially in the Balkans), assassination of Archduke Franz Ferdinand' },
  { front: 'Treaty of Versailles (1919)', back: 'Ended WWI; imposed harsh reparations on Germany; War Guilt Clause; territorial losses; created conditions that contributed to WWII' },
  { front: 'Enlightenment', back: '17th–18th century intellectual movement emphasizing reason, individualism, skepticism of tradition; influenced American and French Revolutions; key thinkers: Locke, Voltaire, Rousseau, Montesquieu' }
]

const historyActiveRecall = [
  {
    question: 'What were the primary causes of World War I?',
    model_answer: 'The primary causes of WWI are summarized by the acronym MAIN: Militarism (European powers built up massive armies and navies), Alliance system (Europe was divided into two armed camps — Triple Entente vs Triple Alliance), Imperialism (competition for colonies created tension), and Nationalism (especially in the Balkans where Slavic peoples sought independence from Austria-Hungary). The immediate trigger was the assassination of Archduke Franz Ferdinand of Austria-Hungary by Gavrilo Princip in Sarajevo on June 28, 1914.'
  },
  {
    question: 'Explain the causes and consequences of the French Revolution.',
    model_answer: 'Causes: Financial crisis of the French monarchy, social inequality under the Estates system (Third Estate bore tax burden), Enlightenment ideas about liberty and rights, food shortages and famine, and weak leadership of Louis XVI. Consequences: Abolition of the monarchy and feudal system, Declaration of Rights of Man, Reign of Terror (radical phase), rise of Napoleon Bonaparte, spread of revolutionary ideals (liberty, equality, fraternity) across Europe, and long-term democratization movements worldwide.'
  },
  {
    question: 'How did the Industrial Revolution transform European society?',
    model_answer: 'The Industrial Revolution (starting ~1760 in Britain) transformed society by: shifting the economy from agriculture to manufacturing; creating the factory system and urban working class (proletariat); generating rapid urbanization and population growth; enabling new social classes (industrial middle class/bourgeoisie); leading to poor working conditions and child labor that sparked labor movements and socialism; transforming transportation (railways, steamships); increasing inequality while also increasing overall wealth; and laying the groundwork for imperialism and colonialism.'
  },
  {
    question: 'What factors enabled European imperialism in the 19th century?',
    model_answer: 'Key factors: Industrial Revolution provided superior weapons and technology (Maxim gun, steamships, railways); Germ theory and quinine reduced European deaths from tropical diseases; improved communications via telegraph; nationalist competition among European powers; economic demand for raw materials and new markets; Social Darwinist ideology that justified European superiority; missionary impulse to spread Christianity and "civilization." By 1914, Europeans controlled ~84% of the world\'s land surface.'
  },
  {
    question: 'Describe the significance of the Magna Carta in the development of democracy.',
    model_answer: 'The Magna Carta (1215) was a charter forced on King John by English barons establishing that the king was subject to the rule of law, not above it. Key principles: no free man could be imprisoned or punished without lawful judgment; the king could not levy taxes without consent of the Great Council. Though initially protecting only nobles, it established the precedent of constitutional governance. It influenced the English Bill of Rights (1689), the U.S. Constitution, and remains a cornerstone document of constitutional democracy and human rights.'
  },
  {
    question: 'What were the major outcomes of the Congress of Vienna (1815)?',
    model_answer: 'The Congress of Vienna (1814-1815), led by Metternich (Austria), Talleyrand (France), Castlereagh (Britain), and Tsar Alexander I, aimed to restore stability after the Napoleonic Wars. Outcomes: Restored pre-revolutionary monarchies (principle of legitimacy); redrew European borders to create a balance of power; created the Concert of Europe (cooperation among major powers to maintain stability); returned France to 1792 borders; created the German Confederation; established the Holy Alliance. It suppressed liberalism and nationalism but created relative peace in Europe until 1848.'
  },
  {
    question: 'Explain the rise and fall of the Soviet Union.',
    model_answer: 'Rise: The 1917 October Revolution brought Bolsheviks to power under Lenin. Stalin industrialized the USSR through Five-Year Plans, collectivization (at great human cost including the Holodomor), and purges that eliminated opposition. The USSR became a superpower after WWII, competing globally with the USA in the Cold War. Fall: Economic stagnation, inefficiency of command economy, costs of the arms race and Afghanistan War, Gorbachev\'s reforms (glasnost and perestroika) that unleashed nationalist movements, 1989 revolutions in Eastern Europe, and the August 1991 coup attempt led to the formal dissolution of the USSR on December 25, 1991.'
  },
  {
    question: 'What were the causes and effects of the Cold War?',
    model_answer: 'Causes: Ideological conflict between US capitalism/democracy and Soviet communism; mutual distrust from WWII; nuclear arms race; Soviet expansion in Eastern Europe; Truman Doctrine (1947). Key events: Berlin Blockade, Korean War, Cuban Missile Crisis, Vietnam War, Space Race, Non-Aligned Movement, détente, Reagan\'s arms buildup. Effects: Nuclear proliferation and MAD doctrine; proxy wars in Korea, Vietnam, Afghanistan, Angola; decolonization shaped by superpower competition; collapse of Soviet bloc 1989-1991; NATO expansion; globalization of American culture and capitalism.'
  },
  {
    question: 'How did the Black Death transform European society?',
    model_answer: 'The Black Death (1347-1351) killed approximately 30-60% of Europe\'s population. Transformations: Labor shortage empowered surviving peasants and contributed to the decline of feudalism; challenged the authority of the Church (which could not explain or stop the plague); spurred mystical religious movements and art obsessed with death (Danse Macabre); accelerated social mobility as survivors inherited wealth; may have contributed to the Renaissance by disrupting traditional structures; promoted interest in medicine and science; traumatized European culture for generations.'
  },
  {
    question: 'Describe the causes and global impact of World War II.',
    model_answer: 'Causes: Rise of fascism in Germany (Hitler/NSDAP), Italy (Mussolini), and Japan; failure of appeasement (Munich Agreement); Great Depression destabilizing democracies; punitive Treaty of Versailles creating German resentment; failure of collective security through the League of Nations; German invasion of Poland (Sept 1, 1939). Global impact: 70-85 million deaths (including Holocaust genocide of 6 million Jews); nuclear age began; UN founded to prevent future wars; Cold War between US and USSR; decolonization accelerated; Marshall Plan rebuilt Western Europe; Israel established; international human rights framework developed.'
  },
  {
    question: 'What is the significance of the Protestant Reformation?',
    model_answer: 'Martin Luther\'s 95 Theses (1517) challenged Catholic Church corruption and doctrine of indulgences. Significance: Broke the religious unity of Western Christendom; established principles of individual conscience and scripture as authority; led to new Protestant denominations (Lutheran, Calvinist, Anglican); triggered the Counter-Reformation (Council of Trent), which reformed Catholicism; caused religious wars (Thirty Years\' War 1618-48); promoted literacy and Bible translation; influenced development of capitalism (Weber\'s Protestant Ethic); advanced concept of religious freedom; contributed to Enlightenment skepticism of authority.'
  },
  {
    question: 'How did European colonialism affect Africa and Asia?',
    model_answer: 'Colonialism imposed European political and economic control over most of Africa and Asia from the 16th-20th centuries. Effects: Exploitation of resources and labor; arbitrary borders drawn without regard for ethnic/cultural boundaries (especially Berlin Conference 1884-85); destruction of local industries to create markets for European goods; introduction of cash crop monocultures; missionary activity and cultural suppression; some infrastructure (railways, ports) built to facilitate extraction; created educated elite that led independence movements; long-term: poverty, political instability, ethnic conflict, and economic dependency in former colonies; also demographic growth through improved medicine.'
  },
  {
    question: 'Explain the Enlightenment and its influence on political revolutions.',
    model_answer: 'The Enlightenment (17th-18th centuries) applied reason and empiricism to human society and governance. Key thinkers: Locke (natural rights, social contract, right to rebel); Voltaire (religious tolerance, freedom of speech); Rousseau (popular sovereignty, general will); Montesquieu (separation of powers). Influence on revolutions: American Revolution incorporated Lockean ideas into Declaration of Independence and Constitution; French Revolution drew on Enlightenment ideals of liberty, equality, fraternity; Latin American independence movements used Enlightenment justifications; long-term influence on liberalism, constitutionalism, republicanism, and human rights frameworks worldwide.'
  },
  {
    question: 'What were the causes and consequences of decolonization after WWII?',
    model_answer: 'Causes: WWII weakened European colonial powers; colonial peoples who fought for European powers demanded rights; UN Charter emphasized self-determination; independence movements strengthened (India\'s Congress Party, African nationalist movements); Cold War superpowers often opposed colonialism (for ideological and strategic reasons). Process: India-Pakistan independence (1947); Indonesian independence (1949); wave of African independence 1957-1968; Vietnamese independence after wars with France then US. Consequences: Emergence of the Third World/Global South; new nations often inherited poor governance structures and arbitrary borders; Cold War proxy conflicts; Non-Aligned Movement; persistent economic dependency (neo-colonialism).'
  },
  {
    question: 'How did the Scientific Revolution change European worldview?',
    model_answer: 'The Scientific Revolution (16th-17th centuries) replaced reliance on ancient authority (Aristotle, Galen) and scripture with empirical observation and mathematical reasoning. Key figures: Copernicus (heliocentric model), Galileo (telescope, laws of motion), Kepler (planetary orbits), Vesalius (human anatomy), Harvey (blood circulation), Newton (laws of motion and gravitation). Impact: Challenged Church authority over nature; established scientific method as basis of knowledge; transformed medicine, astronomy, and physics; provided intellectual basis for the Enlightenment; contributed to idea of progress and human mastery over nature; ultimately led to the Industrial Revolution and modern science and technology.'
  }
]

export async function seedHistoryData(): Promise<void> {
  // Use dynamic import to access electronAPI equivalent in main process
  // This runs in the main process, so we need to use IPC or direct DB access
  // The actual seeding happens via direct DB calls through the db module

  // We use a workaround: check a meta flag via IPC-like mechanism
  // Since this runs in main process, we use the db directly

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Database = require('better-sqlite3')
    const { app } = require('electron')
    const { join } = require('path')

    const dbPath = join(app.getPath('userData'), 'studyhelper.db')
    const db = new Database(dbPath)

    // Check if already seeded
    const seeded = db.prepare('SELECT value FROM app_meta WHERE key = ?').get('history_seeded') as { value: string } | undefined
    if (seeded) {
      db.close()
      return
    }

    // Check if there's a user — seed requires a real user for FK constraints
    const user = db.prepare('SELECT * FROM users LIMIT 1').get() as { id: number } | undefined

    if (!user) {
      // No user yet — onboarding hasn't completed. Skip seeding for now.
      // seedHistoryData will be called again after the user is created.
      db.close()
      return
    }

    const userId = user.id

    // Create World History subject
    const existingSubject = db.prepare('SELECT * FROM subjects WHERE name = ?').get('World History') as { id: number } | undefined
    let subjectId: number

    if (!existingSubject) {
      const result = db.prepare(
        'INSERT INTO subjects (user_id, name, status, course_code, created_at) VALUES (?, ?, ?, ?, ?)'
      ).run(userId, 'World History', 'active', 'HIS-101', new Date().toISOString())
      subjectId = result.lastInsertRowid as number
    } else {
      subjectId = existingSubject.id
    }

    // Insert flashcards
    const insertCard = db.prepare(
      'INSERT INTO cards (subject_id, material_id, type, front, back, is_manual, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    const insertSchedule = db.prepare(
      'INSERT OR IGNORE INTO card_schedule (card_id, user_id, interval, repetitions, ease_factor, due_date, last_reviewed_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )

    const today = new Date().toISOString().split('T')[0]

    const seedAll = db.transaction(() => {
      for (const fc of historyFlashcards) {
        const result = insertCard.run(subjectId, null, 'flashcard', fc.front, fc.back, 0, new Date().toISOString())
        const cardId = result.lastInsertRowid as number
        insertSchedule.run(cardId, userId, 1, 0, 2.5, today, null)
      }

      for (const ar of historyActiveRecall) {
        const result = insertCard.run(subjectId, null, 'active_recall', ar.question, ar.model_answer, 0, new Date().toISOString())
        const cardId = result.lastInsertRowid as number
        insertSchedule.run(cardId, userId, 1, 0, 2.5, today, null)
      }
    })

    seedAll()

    // Mark as seeded (even if userId placeholder)
    db.prepare('INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)').run('history_seeded', 'true')
    db.prepare('INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)').run('history_subject_id', String(subjectId))

    db.close()
    console.log('History seed data inserted successfully')
  } catch (err) {
    console.error('Failed to seed history data:', err)
  }
}
