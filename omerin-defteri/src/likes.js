(function () {
  var script = document.currentScript;
  var postId = script.getAttribute("data-post-id");
  var button = document.getElementById("like-button");
  var countEl = document.getElementById("like-count");
  var storageKey = "begenildi:" + postId;

  function setLiked(liked) {
    if (liked) {
      button.classList.add("liked");
    } else {
      button.classList.remove("liked");
    }
  }

  fetch("/api/begen?post=" + encodeURIComponent(postId))
    .then(function (res) { return res.json(); })
    .then(function (data) { countEl.textContent = data.count; })
    .catch(function () { /* sessizce yoksay, sayfa yine de çalışsın */ });

  setLiked(localStorage.getItem(storageKey) === "1");

  button.addEventListener("click", function () {
    var alreadyLiked = localStorage.getItem(storageKey) === "1";
    if (alreadyLiked) return;

    fetch("/api/begen?post=" + encodeURIComponent(postId), { method: "POST" })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        countEl.textContent = data.count;
        localStorage.setItem(storageKey, "1");
        setLiked(true);
      })
      .catch(function () { /* sessizce yoksay */ });
  });
})();
