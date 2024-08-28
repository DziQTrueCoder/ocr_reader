document.addEventListener('DOMContentLoaded', () => {
    const imageUpload = document.getElementById('imageUpload');
    const processButton = document.getElementById('processButton');
    const resultsDiv = document.getElementById('results');
    const progressBar = document.getElementById('progressBar');
    const timeRemainingDisplay = document.getElementById('timeRemaining');
    const saveResultsButton = document.getElementById('saveResultsButton');

    imageUpload.setAttribute('multiple', true);

    processButton.addEventListener('click', () => {
        const files = imageUpload.files;

        if (files.length === 0) {
            alert("Proszę wybrać obrazy.");
            return;
        }

        resultsDiv.innerHTML = ""; 
        progressBar.value = 0;

        let startTime; 
        let totalTime; 

        let processedFiles = 0;
        let filesQueue = Array.from(files); 

        const MAX_CONCURRENT_PROCESSES = 4; 
        let activeProcesses = 0;

        let averageProcessingTime = 0;
        let processingTimes = [];

        // Funkcja do zapisu wyników do pliku, oznaczając duplikaty
       await function saveResultsToFile(results) {
            return new Promise((resolve, reject) => {
                const fileHandle = saveResultsButton.files[0]; // Pobierz uchwyt pliku

                if (fileHandle) {
                    try {
                        const writable = await fileHandle.createWritable();

                        // Czytamy istniejącą zawartość pliku
                        const file = await fileHandle.getFile();
                        const existingContent = await file.text();
                        const existingLines = existingContent ? existingContent.split('\n') : [];

                        // Tworzymy mapę istniejących nazw dla szybkiego sprawdzania duplikatów
                        const existingNamesMap = new Map();
                        existingLines.forEach(line => {
                            const match = line.match(/^(.*?)( \(\d+\))?$/); 
                            if (match) {
                                const name = match[1];
                                existingNamesMap.set(name, (existingNamesMap.get(name) || 0) + 1);
                            }
                        });

                        // Przetwarzamy nowe wyniki, oznaczając duplikaty
                        const newLines = results.map(name => {
                            const count = existingNamesMap.get(name) || 0;
                            existingNamesMap.set(name, count + 1);
                            return count > 0 ? `${name} (${count + 1})` : name; 
                        });

                        // Dołączamy nowe wyniki na końcu pliku
                        await writable.write(newLines.join('\n') + '\n');
                        await writable.close();
                        resolve();
                    } catch (error) {
                        reject(error);
                    }
                } else {
                    reject(new Error('Nie wybrano pliku.'));
                }
            });
        }

        function processNextFile() {
            if (filesQueue.length === 0 && activeProcesses === 0) {
                totalTime = new Date() - startTime; 
                const totalSeconds = Math.round(totalTime / 1000);
                const totalMinutes = Math.floor(totalSeconds / 60);
                const totalRemainingSeconds = totalSeconds % 60;
                alert(`Całkowity czas przetwarzania: ${totalMinutes}:${totalRemainingSeconds.toString().padStart(2, '0')}`);
                timeRemainingDisplay.textContent = "";
                return;
            }

            if (activeProcesses >= MAX_CONCURRENT_PROCESSES || filesQueue.length === 0) {
                return;
            }

            const file = filesQueue.shift(); 
            activeProcesses++;

            const fileStartTime = new Date();

            Tesseract.recognize(file)
                .then(result => {
                    const text = result.data.text;

                    const igPhrases = text.split('\n').filter(line => {
                        const lowercaseLine = line.toLowerCase();
                        return lowercaseLine.startsWith('ig:') || lowercaseLine.startsWith('ig '); 
                    });

                    const igNames = igPhrases.map(phrase => {
                        const parts = phrase.split(':'); 
                        if (parts.length > 1) {
                            return parts[1].trim(); 
                        } else {
                            return phrase.substring(2).trim(); 
                        }
                    });

                    const fileResultsDiv = document.createElement('div');
                    fileResultsDiv.innerHTML = `<h3>Wyniki dla pliku: ${file.name}</h3>`;
                    fileResultsDiv.innerHTML += igNames.length > 0 ?
                        `<p>Znalezione nazwy po "IG":</p><ul><li>${igNames.join('</li><li>')}</li></ul>` :
                        '<p>Nie znaleziono nazw po "IG".</p>';

                    resultsDiv.appendChild(fileResultsDiv);

                    saveResultsToFile(igNames)
                        .then(() => {
                            console.log('Wyniki zapisane do pliku.');
                        })
                        .catch(error => {
                            console.error('Błąd podczas zapisu do pliku:', error);
                            alert('Wystąpił błąd podczas zapisu wyników do pliku.');
                        });

                    processedFiles++;
                    progressBar.value = Math.round((processedFiles / files.length) * 100);

                    const fileProcessingTime = new Date() - fileStartTime;
                    processingTimes.push(fileProcessingTime);
                    averageProcessingTime = 
                        processingTimes.reduce((sum, time) => sum + time, 0) / processingTimes.length;

                    const remainingFiles = filesQueue.length + activeProcesses - 1;
                    const estimatedTimeRemaining = averageProcessingTime * remainingFiles;
                    const remainingSeconds = Math.round(estimatedTimeRemaining / 1000);
                    const remainingMinutes = Math.floor(remainingSeconds / 60);
                    const remainingDisplaySeconds = remainingSeconds % 60;
                    timeRemainingDisplay.textContent = `Szacowany czas pozostały: ${remainingMinutes}:${remainingDisplaySeconds.toString().padStart(2, '0')}`;

                    activeProcesses--;
                    processNextFile(); 
                })
                .catch(error => {
                    console.error(error);
                    alert(`Wystąpił błąd podczas przetwarzania obrazu ${file.name}.`);

                    activeProcesses--;
                    processNextFile(); 
                });
        }

        startTime = new Date();

        // Wywołaj kliknięcie na ukrytym elemencie input po kliknięciu przycisku "Przetwórz obrazy"
        saveResultsButton.click(); 

        for (let i = 0; i < MAX_CONCURRENT_PROCESSES; i++) {
            processNextFile();
        }

    });
});