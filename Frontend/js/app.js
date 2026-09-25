
console.log("HakiLink application loaded successfully.");

// Smooth scrolling for internal links
document.querySelectorAll('a[href^="#"]').forEach(link => {

```
link.addEventListener("click", function (event) {

    const targetId = this.getAttribute("href");

    if (targetId === "#") {
        event.preventDefault();
        return;
    }

    const target = document.querySelector(targetId);

    if (target) {
        event.preventDefault();

        target.scrollIntoView({
            behavior: "smooth"
        });
    }

});
```

});
